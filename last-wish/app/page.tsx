"use client";

import { startTransition, useEffect, useEffectEvent, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  Copy,
  ExternalLink,
  Fingerprint,
  Landmark,
  Link2,
  LoaderCircle,
  RefreshCcw,
  ScrollText,
  ShieldAlert,
  Wallet,
} from "lucide-react";
import { ethers } from "ethers";
import { networkConfig } from "../lib/config";
import { cn, formatDateTime, formatStt, shortAddress, shortHash } from "../lib/format";
import {
  extractErrorMessage,
  getLastWishContract,
  getLastWishFactory,
  getWalletSigner,
  isUserRejected,
  isWalletAvailable,
  readAccounts,
  readChainId,
  readLastWishSnapshot,
  requestAccounts,
  switchToShannon,
} from "../lib/last-wish";
import type { LastWishSnapshot, PendingTx, WillStatus } from "../lib/types";

type WalletState = {
  availability: "checking" | "available" | "missing";
  connection: "disconnected" | "connecting" | "connected";
  address?: string;
  chainId?: number;
  message?: string;
};

type SnapshotState =
  | { phase: "idle" }
  | { phase: "loading"; address: string }
  | { phase: "error"; address?: string; message: string }
  | { phase: "ready"; data: LastWishSnapshot };

type DeployFormState = {
  heir: string;
  obituaryUrl: string;
  obituaryQuery: string;
  minConfidencePct: string;
  initialEscrowAmount: string;
};

type DeployErrors = Partial<Record<keyof DeployFormState, string>>;

const initialDeployForm: DeployFormState = {
  heir: "",
  obituaryUrl: "",
  obituaryQuery: "",
  minConfidencePct: "95",
  initialEscrowAmount: "",
};

const initialManageAddress = networkConfig.defaultWillAddress ?? "";

const statusCopy: Record<WillStatus, { label: string; detail: string; signal: string }> = {
  Active: {
    label: "Active",
    detail: "Escrow is open. Funding and verification remain public until a verdict lands.",
    signal: "The record is live and awaiting evidence.",
  },
  VerificationPending: {
    label: "Verification pending",
    detail: "The obituary request has been paid. The estate record is waiting on Somnia Agents.",
    signal: "Evidence review is underway.",
  },
  Confirmed: {
    label: "Confirmed",
    detail: "The evidence cleared the threshold. The named heir can release the escrow.",
    signal: "Release path is open to the heir.",
  },
  Failed: {
    label: "Failed",
    detail: "The evidence failed or came back unclear. Only the testator can reopen the case.",
    signal: "The record needs a reset before another attempt.",
  },
  Claimed: {
    label: "Claimed",
    detail: "The inheritance has already left escrow. This file is closed.",
    signal: "The estate transfer is complete.",
  },
};

function normalizeWalletState(next: WalletState): WalletState {
  return {
    availability: next.availability,
    connection: next.connection,
    address: next.address ? ethers.getAddress(next.address) : undefined,
    chainId: next.chainId,
    message: next.message,
  };
}

function walletStateChanged(current: WalletState, next: WalletState) {
  return (
    current.availability !== next.availability ||
    current.connection !== next.connection ||
    current.address !== next.address ||
    current.chainId !== next.chainId ||
    current.message !== next.message
  );
}

function snapshotChanged(current: LastWishSnapshot, next: LastWishSnapshot) {
  return (
    current.contractAddress !== next.contractAddress ||
    current.testator !== next.testator ||
    current.heir !== next.heir ||
    current.obituaryUrl !== next.obituaryUrl ||
    current.obituaryQuery !== next.obituaryQuery ||
    current.minConfidencePct !== next.minConfidencePct ||
    current.status !== next.status ||
    current.requestId !== next.requestId ||
    current.verdict !== next.verdict ||
    current.confirmedAt !== next.confirmedAt ||
    current.balanceWei !== next.balanceWei ||
    current.requestDepositWei !== next.requestDepositWei ||
    current.platformAddress !== next.platformAddress
  );
}

const stateSequence: { key: WillStatus; copy: string }[] = [
  { key: "Active", copy: "Funding open. Verification can be requested." },
  { key: "VerificationPending", copy: "Deposit posted. Awaiting evidence verdict." },
  { key: "Confirmed", copy: "Threshold cleared. Heir may release escrow." },
  { key: "Failed", copy: "Verdict missed. Testator may reset the case." },
  { key: "Claimed", copy: "Escrow released. Record remains public." },
];

export default function Home() {
  const [wallet, setWallet] = useState<WalletState>({
    availability: "checking",
    connection: "disconnected",
  });
  const [manageAddressInput, setManageAddressInput] = useState(initialManageAddress);
  const [loadedAddress, setLoadedAddress] = useState(initialManageAddress);
  const [manageAddressError, setManageAddressError] = useState("");
  const [snapshotState, setSnapshotState] = useState<SnapshotState>(
    initialManageAddress ? { phase: "loading", address: initialManageAddress } : { phase: "idle" },
  );
  const [deployForm, setDeployForm] = useState<DeployFormState>(initialDeployForm);
  const [deployErrors, setDeployErrors] = useState<DeployErrors>({});
  const [fundAmount, setFundAmount] = useState("");
  const [verifyBaseAmount, setVerifyBaseAmount] = useState(
    ethers.formatEther(networkConfig.requestDepositWei),
  );
  const [verifyExtraAmount, setVerifyExtraAmount] = useState("");
  const [notice, setNotice] = useState("");
  const [errorBanner, setErrorBanner] = useState("");
  const [txFeed, setTxFeed] = useState<PendingTx[]>([]);

  const snapshot = snapshotState.phase === "ready" ? snapshotState.data : undefined;
  const walletOnWrongNetwork =
    wallet.connection === "connected" &&
    wallet.chainId !== undefined &&
    wallet.chainId !== networkConfig.chainId;
  const liveStatus = snapshot ? statusCopy[snapshot.status] : undefined;

  const role = useMemo(() => {
    if (!snapshot || !wallet.address) return "Viewer";
    const current = wallet.address.toLowerCase();
    if (current === snapshot.testator.toLowerCase()) return "Testator";
    if (current === snapshot.heir.toLowerCase()) return "Heir";
    return "Viewer";
  }, [snapshot, wallet.address]);

  const walletMode = useMemo(() => {
    if (wallet.availability === "missing") {
      return {
        label: "Read-only mode",
        detail: "No injected wallet detected. Public reads stay available over Shannon RPC.",
        tone: "warning" as const,
      };
    }

    if (wallet.connection === "connected") {
      return {
        label: "Desk unlocked",
        detail: `Connected as ${shortAddress(wallet.address ?? "")}.`,
        tone: "signal" as const,
      };
    }

    if (wallet.connection === "connecting") {
      return {
        label: "Awaiting wallet approval",
        detail: "The desk is waiting on the signer.",
        tone: "default" as const,
      };
    }

    return {
      label: "Wallet available",
      detail: "Connect to deploy or submit writes.",
      tone: "default" as const,
    };
  }, [wallet]);

  const syncWalletState = useEffectEvent(async () => {
    if (!isWalletAvailable()) {
      const next = normalizeWalletState({
        availability: "missing",
        connection: "disconnected",
        message: "Read-only mode is active. Deployments and writes require an injected wallet.",
      });
      setWallet((current) => (walletStateChanged(current, next) ? next : current));
      return;
    }

    try {
      const [accounts, chainId] = await Promise.all([readAccounts(), readChainId()]);
      const next = normalizeWalletState(
        accounts.length
          ? {
              availability: "available",
              connection: "connected",
              address: accounts[0],
              chainId,
            }
          : {
              availability: "available",
              connection: "disconnected",
              chainId,
              message: "A wallet is available. Connect it when a write is required.",
            },
      );
      setWallet((current) => (walletStateChanged(current, next) ? next : current));
    } catch (error) {
      const next = normalizeWalletState({
        availability: "available",
        connection: "disconnected",
        message: extractErrorMessage(error),
      });
      setWallet((current) => (walletStateChanged(current, next) ? next : current));
    }
  });

  const loadSnapshot = useEffectEvent(async (address: string, silent = false) => {
    const normalized = ethers.getAddress(address);
    if (!silent) {
      setSnapshotState({ phase: "loading", address: normalized });
    }

    try {
      const data = await readLastWishSnapshot(normalized);
      setSnapshotState((current) => {
        if (current.phase === "ready" && snapshotChanged(current.data, data) === false) {
          return current;
        }
        return { phase: "ready", data };
      });
      setErrorBanner("");
    } catch (error) {
      setSnapshotState({
        phase: "error",
        address: normalized,
        message: extractErrorMessage(error),
      });
    }
  });

  useEffect(() => {
    void syncWalletState();

    if (!window.ethereum?.on || !window.ethereum.removeListener) {
      return;
    }

    const handleAccountsChanged = () => {
      void syncWalletState();
    };
    const handleChainChanged = () => {
      void syncWalletState();
    };

    window.ethereum.on("accountsChanged", handleAccountsChanged);
    window.ethereum.on("chainChanged", handleChainChanged);

    return () => {
      window.ethereum?.removeListener?.("accountsChanged", handleAccountsChanged);
      window.ethereum?.removeListener?.("chainChanged", handleChainChanged);
    };
  }, []);

  useEffect(() => {
    if (!loadedAddress) return;

    void loadSnapshot(loadedAddress);

    const interval = window.setInterval(() => {
      void loadSnapshot(loadedAddress, true);
    }, 15_000);

    return () => {
      window.clearInterval(interval);
    };
  }, [loadedAddress]);

  function pushTx(tx: PendingTx) {
    setTxFeed((current) => [tx, ...current].slice(0, 6));
  }

  function patchTx(id: string, patch: Partial<PendingTx>) {
    setTxFeed((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  async function copyText(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      setNotice(`${label} copied.`);
      setErrorBanner("");
    } catch {
      setErrorBanner(`Could not copy ${label.toLowerCase()}.`);
    }
  }

  async function connectWallet() {
    if (!isWalletAvailable()) {
      setErrorBanner("No injected wallet detected. Open this page in a wallet-enabled browser.");
      return;
    }

    setWallet((current) =>
      normalizeWalletState({ ...current, connection: "connecting", message: undefined }),
    );
    setNotice("");

    try {
      await requestAccounts();
      await syncWalletState();
    } catch (error) {
      if (isUserRejected(error)) {
        setWallet((current) =>
          normalizeWalletState({
            ...current,
            availability: "available",
            connection: "disconnected",
            message: "The wallet request was declined.",
          }),
        );
        return;
      }

      setErrorBanner(extractErrorMessage(error));
      await syncWalletState();
    }
  }

  async function ensureSigner(actionLabel: string) {
    const { signer, chainId } = await getWalletSigner();
    if (chainId !== networkConfig.chainId) {
      throw new Error(
        `${actionLabel} requires ${networkConfig.name}. Switch from chain ${chainId} before continuing.`,
      );
    }
    return { signer };
  }

  async function runWriteAction(
    action: PendingTx["action"],
    label: string,
    execute: (signer: ethers.Signer) => Promise<ethers.TransactionResponse>,
  ) {
    const txId = `${action}-${Date.now()}`;
    pushTx({ id: txId, action, label, status: "awaiting-signature" });
    setNotice("");
    setErrorBanner("");

    try {
      const { signer } = await ensureSigner(label);
      const tx = await execute(signer);
      patchTx(txId, { status: "submitted", hash: tx.hash });
      const receipt = await tx.wait();
      patchTx(txId, { status: "confirmed", hash: receipt?.hash ?? tx.hash });
      if (loadedAddress) await loadSnapshot(loadedAddress, true);
      await syncWalletState();
      return receipt;
    } catch (error) {
      if (isUserRejected(error)) {
        setTxFeed((current) => current.filter((item) => item.id !== txId));
        setNotice(`${label} was cancelled in the wallet.`);
        return null;
      }

      patchTx(txId, { status: "failed", error: extractErrorMessage(error) });
      setErrorBanner(extractErrorMessage(error));
      return null;
    }
  }

  function validateDeployForm(values: DeployFormState) {
    const errors: DeployErrors = {};

    if (!ethers.isAddress(values.heir.trim())) {
      errors.heir = "Enter a valid EVM address for the heir.";
    }

    if (!values.obituaryUrl.trim()) {
      errors.obituaryUrl = "An obituary source URL is required.";
    } else {
      try {
        const url = new URL(values.obituaryUrl.trim());
        if (!/^https?:$/.test(url.protocol)) {
          errors.obituaryUrl = "Use an http or https obituary URL.";
        }
      } catch {
        errors.obituaryUrl = "Enter a valid obituary URL.";
      }
    }

    if (!values.obituaryQuery.trim()) {
      errors.obituaryQuery = "State the question the agent should answer.";
    }

    const confidence = Number(values.minConfidencePct);
    if (!Number.isInteger(confidence) || confidence < 1 || confidence > 100) {
      errors.minConfidencePct = "Confidence must be a whole percentage between 1 and 100.";
    }

    if (values.initialEscrowAmount.trim()) {
      try {
        if (ethers.parseEther(values.initialEscrowAmount.trim()) < 0n) {
          errors.initialEscrowAmount = "Escrow cannot be negative.";
        }
      } catch {
        errors.initialEscrowAmount = "Enter a valid STT amount.";
      }
    }

    return errors;
  }

  async function handleDeploy(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const errors = validateDeployForm(deployForm);
    setDeployErrors(errors);
    setErrorBanner("");
    setNotice("");

    if (Object.keys(errors).length > 0) return;

    const txId = `deploy-${Date.now()}`;
    pushTx({
      id: txId,
      action: "deploy",
      label: "Deploy estate record",
      status: "awaiting-signature",
    });

    try {
      const { signer } = await ensureSigner("Deployment");
      const factory = getLastWishFactory(signer);
      const initialValue = deployForm.initialEscrowAmount.trim()
        ? ethers.parseEther(deployForm.initialEscrowAmount.trim())
        : 0n;

      const contract = await factory.deploy(
        ethers.getAddress(deployForm.heir.trim()),
        deployForm.obituaryUrl.trim(),
        deployForm.obituaryQuery.trim(),
        Number(deployForm.minConfidencePct),
        { value: initialValue },
      );

      const deploymentTx = contract.deploymentTransaction();
      if (!deploymentTx) {
        throw new Error("Wallet returned no deployment transaction.");
      }

      patchTx(txId, { status: "submitted", hash: deploymentTx.hash });
      await contract.waitForDeployment();
      const contractAddress = await contract.getAddress();
      patchTx(txId, {
        status: "confirmed",
        hash: deploymentTx.hash,
        contractAddress,
      });

      setNotice("The estate record is deployed. The desk now points at the new contract.");
      startTransition(() => {
        setManageAddressInput(contractAddress);
        setLoadedAddress(contractAddress);
      });
      setDeployForm(initialDeployForm);
      await loadSnapshot(contractAddress);
      document.getElementById("workspace")?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (error) {
      if (isUserRejected(error)) {
        setTxFeed((current) => current.filter((item) => item.id !== txId));
        setNotice("Deployment was cancelled in the wallet.");
        return;
      }

      patchTx(txId, { status: "failed", error: extractErrorMessage(error) });
      setErrorBanner(extractErrorMessage(error));
    }
  }

  async function handleLoadWill(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setManageAddressError("");

    try {
      const normalized = ethers.getAddress(manageAddressInput.trim());
      setLoadedAddress(normalized);
      await loadSnapshot(normalized);
    } catch {
      setManageAddressError("Enter a valid deployed LastWish contract address.");
    }
  }

  async function handleFund(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!snapshot) return;
    if (!fundAmount.trim()) {
      setErrorBanner("Enter an STT amount before funding.");
      return;
    }

    let value: bigint;
    try {
      value = ethers.parseEther(fundAmount.trim());
    } catch {
      setErrorBanner("Enter a valid STT amount to fund the contract.");
      return;
    }

    const receipt = await runWriteAction("fund", "Fund escrow", async (signer) => {
      const contract = getLastWishContract(snapshot.contractAddress, signer);
      return contract.fund({ value });
    });

    if (receipt) {
      setFundAmount("");
    }
  }

  async function handleVerify(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!snapshot) return;

    let base: bigint;
    let extra = 0n;

    try {
      base = ethers.parseEther(verifyBaseAmount.trim());
      if (verifyExtraAmount.trim()) {
        extra = ethers.parseEther(verifyExtraAmount.trim());
      }
    } catch {
      setErrorBanner("Enter valid STT amounts for the request deposit and any extra buffer.");
      return;
    }

    const total = base + extra;
    await runWriteAction("verify", "Trigger obituary verification", async (signer) => {
      const contract = getLastWishContract(snapshot.contractAddress, signer);
      return contract.verifyObituary({ value: total });
    });
  }

  async function handleClaim() {
    if (!snapshot) return;
    await runWriteAction("claim", "Claim inheritance", async (signer) => {
      const contract = getLastWishContract(snapshot.contractAddress, signer);
      return contract.claim();
    });
  }

  async function handleReset() {
    if (!snapshot) return;
    await runWriteAction("reset", "Reset failed verification", async (signer) => {
      const contract = getLastWishContract(snapshot.contractAddress, signer);
      return contract.resetAfterFailure();
    });
  }

  async function handleSwitchNetwork() {
    setErrorBanner("");
    setNotice("");

    try {
      await switchToShannon();
      await syncWalletState();
      setNotice(`${networkConfig.name} is now selected in the wallet.`);
    } catch (error) {
      if (isUserRejected(error)) {
        setNotice("Network switch was cancelled in the wallet.");
        return;
      }
      setErrorBanner(extractErrorMessage(error));
    }
  }

  const executionFlow = [
    {
      step: "01",
      title: "Deploy",
      gate: "Testator signs constructor",
      output: "Parties, obituary source, query, threshold",
      icon: <Fingerprint aria-hidden="true" size={16} />,
    },
    {
      step: "02",
      title: "Fund",
      gate: "Any wallet while Active",
      output: "Escrow balance increases in STT",
      icon: <Landmark aria-hidden="true" size={16} />,
    },
    {
      step: "03",
      title: "Verify",
      gate: "Deposit posted to Somnia Agents",
      output: "Request ID and verdict become visible",
      icon: <ScrollText aria-hidden="true" size={16} />,
    },
    {
      step: "04",
      title: "Claim / reset",
      gate: "Heir after Confirmed, testator after Failed",
      output: "Escrow releases or record reopens",
      icon: <ShieldAlert aria-hidden="true" size={16} />,
    },
  ];

  return (
    <main className="page-shell">
      <section className="hero-shell">
        <header className="topbar">
          <div className="brand-lockup">
            <p className="eyebrow">Somnia estate protocol</p>
            <div className="brand-row">
              <span className="brand-mark" aria-hidden="true" />
              <span className="brand-name">Last Wish</span>
            </div>
          </div>

          <div className="topbar-actions">
            <a className="button button-ghost" href="#workspace">
              Open workspace
            </a>
            <button
              className="button button-primary"
              type="button"
              onClick={connectWallet}
              disabled={wallet.connection === "connecting"}
              aria-busy={wallet.connection === "connecting"}
            >
              <Wallet aria-hidden="true" size={16} />
              {wallet.connection === "connecting"
                ? "Connecting..."
                : wallet.connection === "connected"
                  ? shortAddress(wallet.address ?? "")
                  : "Connect wallet"}
            </button>
          </div>
        </header>

        <div className="hero-grid">
          <section className="hero-copy">
            <p className="eyebrow">Obituary-triggered escrow</p>
            <h1>Last Wish</h1>
            <p className="hero-lede">
              A Somnia escrow desk for inheritance records. It names the heir, stores the evidence
              request, exposes the deposit, and blocks release until the public state changes.
            </p>

            <div className="hero-actions">
              <a className="button button-primary" href="#deploy-panel">
                Open a record <ArrowRight aria-hidden="true" size={16} />
              </a>
              <a className="button button-secondary" href="#manage-panel">
                Load an existing record
              </a>
            </div>

            <dl className="signal-strip">
              <SignalItem label="Mode" value={walletMode.label} tone={walletMode.tone} />
              <SignalItem
                label="Network"
                value={`${networkConfig.name} (${networkConfig.chainId})`}
                tone={walletOnWrongNetwork ? "warning" : "default"}
              />
              <SignalItem
                label="Request deposit"
                value={`${formatStt(networkConfig.requestDepositWei, 2)} STT`}
              />
              <SignalItem
                label="Loaded state"
                value={liveStatus?.label ?? "No record loaded"}
                tone={snapshot ? "signal" : "default"}
              />
            </dl>
          </section>

          <ProductScreenshot snapshot={snapshot} role={role} walletMode={walletMode.label} />
        </div>

        <div className="notice-stack" aria-live="polite">
          {walletOnWrongNetwork && (
            <Banner
              tone="warning"
              title="Wrong network selected"
              body={`Connected wallet is on chain ${wallet.chainId}. Writes require ${networkConfig.name} (${networkConfig.chainId}).`}
              action={
                <button className="button button-secondary" type="button" onClick={handleSwitchNetwork}>
                  Switch to Shannon
                </button>
              }
            />
          )}
          {wallet.message && !walletOnWrongNetwork && (
            <Banner tone="neutral" title={walletMode.label} body={wallet.message} />
          )}
          {notice && <Banner tone="success" title="Workspace update" body={notice} />}
          {errorBanner && <Banner tone="error" title="Action blocked" body={errorBanner} />}
        </div>

        <section className="protocol-map" aria-label="Protocol state and evidence map">
          <article className="protocol-board">
            <div className="panel-headline-row">
              <div>
                <PanelKicker label="Protocol map" />
                <h2>One contract file. Every gate exposed.</h2>
              </div>
              <div className="board-current">
                <span>Loaded state</span>
                {snapshot ? <StatusPill status={snapshot.status} /> : <CaseTag label="Idle" />}
              </div>
            </div>

            <div className="state-map">
              {stateSequence.map((item) => (
                <div
                  className="state-node"
                  data-active={snapshot?.status === item.key}
                  key={item.key}
                >
                  <span className="state-node-dot" aria-hidden="true" />
                  <strong>{statusCopy[item.key].label}</strong>
                  <p>{item.copy}</p>
                </div>
              ))}
            </div>
          </article>

          <aside className="evidence-console">
            <div className="evidence-panel">
              <PanelKicker label="Role matrix" />
              <h3>Writers are explicit.</h3>
              <div className="role-matrix">
                <MatrixRow actor="Any wallet" action="Fund / verify" gate="Active" />
                <MatrixRow actor="Heir" action="Claim" gate="Confirmed" />
                <MatrixRow actor="Testator" action="Reset" gate="Failed" />
              </div>
            </div>

            <div className="evidence-panel evidence-panel-inset">
              <PanelKicker label="Evidence ledger" />
              <MetricPair label="Role" value={role} />
              <MetricPair
                label="Escrow"
                value={snapshot ? `${formatStt(snapshot.balanceWei, 2)} STT` : "No balance loaded"}
              />
              <MetricPair
                label="Request"
                value={snapshot ? (snapshot.requestId === "0" ? "Not requested" : "Recorded") : "Idle"}
              />
              <MetricPair
                label="Verdict"
                value={snapshot ? snapshot.verdict || "Awaiting verdict" : "No verdict"}
              />
            </div>
          </aside>
        </section>

        <section className="execution-shell" aria-label="Mechanism overview">
          <div className="mechanism-copy">
            <p className="eyebrow">Execution path</p>
            <h2>Records first. Money only moves through state.</h2>
            <p>
              The interface keeps the write path narrow: deploy the file, fund the escrow, post the
              verification deposit, then release or reopen only when the contract state allows it.
            </p>
          </div>

          <div className="execution-flow">
            {executionFlow.map((item, index) => (
              <article className="flow-step" key={item.title}>
                <div className="flow-step-head">
                  <span className="mechanism-icon">{item.icon}</span>
                  <span className="flow-step-index">{item.step}</span>
                </div>
                <h3>{item.title}</h3>
                <dl>
                  <div>
                    <dt>Gate</dt>
                    <dd>{item.gate}</dd>
                  </div>
                  <div>
                    <dt>Output</dt>
                    <dd>{item.output}</dd>
                  </div>
                </dl>
                {index < executionFlow.length - 1 && (
                  <ArrowRight className="flow-arrow" aria-hidden="true" size={18} />
                )}
              </article>
            ))}
          </div>
        </section>
      </section>

      <section className="workspace-shell" id="workspace">
        <div className="workspace-header">
          <div>
            <p className="eyebrow">Operational workspace</p>
            <h2>Deploy, inspect, fund, verify, release.</h2>
          </div>
          <div className="workspace-summary">
            <SummaryPill label="Wallet" value={walletMode.label} />
            <SummaryPill label="Role" value={role} />
            <SummaryPill label="State" value={liveStatus?.label ?? "Idle"} />
          </div>
        </div>

        <div className="workspace-grid">
          <div className="workspace-column">
            <section className="control-panel" id="deploy-panel">
              <PanelHeading
                eyebrow="Create record"
                title="Write constructor inputs onchain"
                body="The connected wallet deploys the contract, sets the evidence source, names the heir, and may attach opening escrow."
              />

              <form className="control-form" onSubmit={handleDeploy}>
                <fieldset className="field-group">
                  <legend>Actors and source</legend>
                  <TextField
                    id="heir"
                    label="Heir address"
                    value={deployForm.heir}
                    onChange={(value) => setDeployForm((current) => ({ ...current, heir: value }))}
                    placeholder="0x..."
                    helper="Single heir for the current contract flow."
                    error={deployErrors.heir}
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <TextField
                    id="obituary-url"
                    label="Obituary URL"
                    type="url"
                    value={deployForm.obituaryUrl}
                    onChange={(value) => setDeployForm((current) => ({ ...current, obituaryUrl: value }))}
                    placeholder="https://..."
                    helper="Public source the verification agent should inspect."
                    error={deployErrors.obituaryUrl}
                    autoComplete="url"
                    spellCheck={false}
                  />
                  <TextField
                    id="obituary-query"
                    label="Verification question"
                    value={deployForm.obituaryQuery}
                    onChange={(value) => setDeployForm((current) => ({ ...current, obituaryQuery: value }))}
                    placeholder="Does this page contain Jane Doe's obituary?"
                    helper="This question becomes the evidence test."
                    error={deployErrors.obituaryQuery}
                  />
                </fieldset>

                <fieldset className="field-group">
                  <legend>Threshold and escrow</legend>
                  <TextField
                    id="confidence"
                    label="Minimum confidence percentage"
                    value={deployForm.minConfidencePct}
                    onChange={(value) => setDeployForm((current) => ({ ...current, minConfidencePct: value }))}
                    placeholder="95"
                    helper="Recorded onchain as the minimum acceptable verdict."
                    error={deployErrors.minConfidencePct}
                    inputMode="numeric"
                    pattern="[0-9]*"
                    spellCheck={false}
                  />
                  <TextField
                    id="initial-escrow"
                    label="Opening escrow amount"
                    value={deployForm.initialEscrowAmount}
                    onChange={(value) =>
                      setDeployForm((current) => ({ ...current, initialEscrowAmount: value }))
                    }
                    placeholder="10.0"
                    helper="Optional. Leave blank to deploy unfunded."
                    error={deployErrors.initialEscrowAmount}
                    inputMode="decimal"
                    spellCheck={false}
                  />
                </fieldset>

                <div className="form-footer">
                  <button
                    className="button button-primary"
                    type="submit"
                    disabled={wallet.connection === "connecting" || walletOnWrongNetwork}
                    aria-busy={wallet.connection === "connecting"}
                  >
                    Deploy record
                  </button>
                  <p className="footnote">
                    Uses <code>out/LastWish.sol/LastWish.json</code> from this workspace.
                  </p>
                </div>
              </form>
            </section>

            <section className="control-panel control-panel-muted">
              <PanelHeading
                eyebrow="System constants"
                title="Network and integration facts"
                body="These values define the request surface and explorer path for every record."
              />

              <dl className="ledger-grid">
                <LedgerRow label="Wallet support" value="Injected EIP-1193 only" />
                <LedgerRow
                  label="Network"
                  value={`${networkConfig.name} (${networkConfig.chainId})`}
                />
                <LedgerRow
                  label="Explorer"
                  value={
                    <a href={networkConfig.explorerUrl} target="_blank" rel="noreferrer">
                      Open Shannon explorer <ExternalLink aria-hidden="true" size={14} />
                    </a>
                  }
                />
                <LedgerRow
                  label="Request deposit"
                  value={`${formatStt(networkConfig.requestDepositWei, 2)} STT`}
                />
                <LedgerRow
                  label="Platform"
                  value={
                    <button
                      className="inline-control"
                      type="button"
                      onClick={() => void copyText(networkConfig.platformAddress, "Platform address")}
                    >
                      <span className="mono">{shortAddress(networkConfig.platformAddress)}</span>
                      <Copy aria-hidden="true" size={14} />
                    </button>
                  }
                />
              </dl>
            </section>
          </div>

          <div className="workspace-column">
            <section className="control-panel" id="manage-panel">
              <PanelHeading
                eyebrow="Load record"
                title="Point the workspace at a deployed contract"
                body="Read the current status, role gates, escrow balance, evidence inputs, and release readiness from one address."
              />

              <form className="address-form" onSubmit={handleLoadWill}>
                <TextField
                  id="manage-address"
                  label="Contract address"
                  value={manageAddressInput}
                  onChange={setManageAddressInput}
                  placeholder="0x..."
                  helper="Paste a deployed LastWish address or set NEXT_PUBLIC_DEFAULT_WILL_ADDRESS."
                  error={manageAddressError}
                  autoComplete="off"
                  spellCheck={false}
                />
                <div className="address-actions">
                  <button className="button button-primary" type="submit">
                    Read record
                  </button>
                  {loadedAddress && (
                    <button
                      className="button button-secondary"
                      type="button"
                      onClick={() => void loadSnapshot(loadedAddress)}
                    >
                      <RefreshCcw aria-hidden="true" size={16} />
                      Refresh
                    </button>
                  )}
                </div>
              </form>

              {snapshotState.phase === "idle" && (
                <StateCard
                  tone="neutral"
                  title="No record loaded"
                  body="Deploy above or point this workspace at a deployed address."
                  icon={<Link2 aria-hidden="true" size={18} />}
                />
              )}

              {snapshotState.phase === "loading" && (
                <SnapshotSkeleton
                  title="Reading the record"
                  subtitle="Pulling the latest state from Shannon."
                />
              )}

              {snapshotState.phase === "error" && (
                <StateCard
                  tone="error"
                  title="Couldn't read this record"
                  body={snapshotState.message}
                  icon={<AlertTriangle aria-hidden="true" size={18} />}
                  actionLabel={snapshotState.address ? "Retry" : undefined}
                  onAction={
                    snapshotState.address ? () => void loadSnapshot(snapshotState.address as string) : undefined
                  }
                />
              )}

              {snapshot && (
                <div className="record-dossier">
                  <div className="record-dossier-head">
                    <div>
                      <p className="eyebrow">Loaded file</p>
                      <h3>{shortAddress(snapshot.contractAddress, 10, 6)}</h3>
                    </div>
                    <div className="badge-row">
                      <StatusPill status={snapshot.status} />
                      <RolePill role={role} />
                    </div>
                  </div>

                  <p className="status-detail">{statusCopy[snapshot.status].detail}</p>

                  <div className="dossier-grid">
                    <AddressRecord
                      label="Contract"
                      value={snapshot.contractAddress}
                      explorerHref={`${networkConfig.explorerUrl}address/${snapshot.contractAddress}`}
                      onCopy={copyText}
                    />
                    <AddressRecord label="Testator" value={snapshot.testator} onCopy={copyText} />
                    <AddressRecord label="Heir" value={snapshot.heir} onCopy={copyText} />
                    <EvidenceRecord label="Escrow balance" value={`${formatStt(snapshot.balanceWei)} STT`} />
                    <EvidenceRecord label="Min confidence" value={`${snapshot.minConfidencePct}%`} />
                    <EvidenceRecord label="Confirmed at" value={formatDateTime(snapshot.confirmedAt)} />
                    <EvidenceRecord label="Obituary URL" value={snapshot.obituaryUrl} />
                    <EvidenceRecord label="Verification question" value={snapshot.obituaryQuery} />
                    <EvidenceRecord
                      label="Request ID"
                      value={snapshot.requestId === "0" ? "Not requested" : snapshot.requestId}
                      mono
                    />
                    <EvidenceRecord label="Verdict" value={snapshot.verdict || "Awaiting verdict"} />
                  </div>
                </div>
              )}
            </section>

            <section className="control-panel">
              <PanelHeading
                eyebrow="Action bay"
                title="Run the permitted write"
                body="The contract behavior is unchanged. The workspace only makes the gate conditions legible."
              />

              {!snapshot ? (
                <StateCard
                  tone="neutral"
                  title="No active record"
                  body="Load a contract first. Funding, verification, claim, and reset all depend on a live record."
                  icon={<ScrollText aria-hidden="true" size={18} />}
                />
              ) : (
                <div className="action-grid">
                  <form className="action-panel" onSubmit={handleFund}>
                    <div className="action-head">
                      <div>
                        <p className="eyebrow">Fund</p>
                        <h4>Add STT to escrow</h4>
                      </div>
                      <ActionState
                        enabled={snapshot.status === "Active"}
                        reason="Funding is only open while the record is Active."
                      />
                    </div>
                    <TextField
                      id="fund-amount"
                      label="STT amount"
                      value={fundAmount}
                      onChange={setFundAmount}
                      placeholder="1.5"
                      helper="Any wallet may add funds before verification begins."
                      inputMode="decimal"
                      spellCheck={false}
                    />
                    <button
                      className="button button-primary"
                      type="submit"
                      disabled={snapshot.status !== "Active" || walletOnWrongNetwork}
                    >
                      Fund escrow
                    </button>
                  </form>

                  <form className="action-panel" onSubmit={handleVerify}>
                    <div className="action-head">
                      <div>
                        <p className="eyebrow">Verify</p>
                        <h4>Trigger obituary verification</h4>
                      </div>
                      <ActionState
                        enabled={snapshot.status === "Active"}
                        reason="Verification begins only from Active."
                      />
                    </div>
                    <TextField
                      id="verify-base"
                      label="Request deposit"
                      value={verifyBaseAmount}
                      onChange={setVerifyBaseAmount}
                      placeholder="0.12"
                      helper={`Current contract deposit is ${formatStt(snapshot.requestDepositWei, 2)} STT.`}
                      inputMode="decimal"
                      spellCheck={false}
                    />
                    <TextField
                      id="verify-extra"
                      label="Optional extra buffer"
                      value={verifyExtraAmount}
                      onChange={setVerifyExtraAmount}
                      placeholder="0.00"
                      helper="Any amount above the deposit is handled by the contract."
                      inputMode="decimal"
                      spellCheck={false}
                    />
                    <button
                      className="button button-primary"
                      type="submit"
                      disabled={snapshot.status !== "Active" || walletOnWrongNetwork}
                    >
                      Trigger verification
                    </button>
                  </form>

                  <div className="action-panel">
                    <div className="action-head">
                      <div>
                        <p className="eyebrow">Claim</p>
                        <h4>Release confirmed inheritance</h4>
                      </div>
                      <ActionState
                        enabled={snapshot.status === "Confirmed" && role === "Heir"}
                        reason="Only the heir may claim after confirmation."
                      />
                    </div>
                    <p className="action-copy">
                      Connected role resolves to <strong>{role}</strong>. Release remains blocked
                      until the verdict is `Confirmed`.
                    </p>
                    <button
                      className="button button-primary"
                      type="button"
                      onClick={() => void handleClaim()}
                      disabled={snapshot.status !== "Confirmed" || role !== "Heir" || walletOnWrongNetwork}
                    >
                      Claim inheritance
                    </button>
                  </div>

                  <div className="action-panel">
                    <div className="action-head">
                      <div>
                        <p className="eyebrow">Reset</p>
                        <h4>Reopen a failed case</h4>
                      </div>
                      <ActionState
                        enabled={snapshot.status === "Failed" && role === "Testator"}
                        reason="Only the testator may reset after failure."
                      />
                    </div>
                    <p className="action-copy">
                      Reset returns the record to `Active` after an ambiguous or rejected verdict.
                    </p>
                    <button
                      className="button button-secondary"
                      type="button"
                      onClick={() => void handleReset()}
                      disabled={snapshot.status !== "Failed" || role !== "Testator" || walletOnWrongNetwork}
                    >
                      Reset after failure
                    </button>
                  </div>
                </div>
              )}
            </section>

            <section className="control-panel">
              <PanelHeading
                eyebrow="Transaction feed"
                title="Track wallet signatures and chain confirmations"
                body="Every write moves through signature, submission, confirmation, or failure."
              />

              {txFeed.length === 0 ? (
                <StateCard
                  tone="neutral"
                  title="No chain actions logged"
                  body="Deployments and writes will appear here with hashes and outcomes."
                  icon={<Wallet aria-hidden="true" size={18} />}
                />
              ) : (
                <div className="timeline">
                  {txFeed.map((tx) => (
                    <article className="timeline-item" key={tx.id}>
                      <div className={cn("timeline-dot", `timeline-${tx.status}`)} aria-hidden="true">
                        {tx.status === "awaiting-signature" ? (
                          <Wallet size={14} />
                        ) : tx.status === "submitted" ? (
                          <LoaderCircle className="spin" size={14} />
                        ) : tx.status === "confirmed" ? (
                          <BadgeCheck size={14} />
                        ) : (
                          <AlertTriangle size={14} />
                        )}
                      </div>
                      <div className="timeline-copy">
                        <strong>{tx.label}</strong>
                        <p>{humanTxStatus(tx)}</p>
                        {tx.hash && (
                          <div className="timeline-links">
                            <button
                              className="inline-control"
                              type="button"
                              onClick={() => void copyText(tx.hash as string, "Transaction hash")}
                            >
                              <span className="mono">{shortHash(tx.hash)}</span>
                              <Copy aria-hidden="true" size={14} />
                            </button>
                            <a
                              className="text-link"
                              href={`${networkConfig.explorerUrl}tx/${tx.hash}`}
                              target="_blank"
                              rel="noreferrer"
                            >
                              Explorer <ExternalLink aria-hidden="true" size={14} />
                            </a>
                          </div>
                        )}
                        {tx.contractAddress && (
                          <p className="tiny-copy">Contract: {shortAddress(tx.contractAddress)}</p>
                        )}
                        {tx.error && <p className="inline-error">{tx.error}</p>}
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>

        <section className="caution-strip" aria-label="Operational caveat">
          <p className="eyebrow">Boundary</p>
          <p>
            Last Wish exposes a public escrow workflow with role gates and evidence state. It does
            not represent probate, legal finality, or identity adjudication.
          </p>
        </section>
      </section>
    </main>
  );
}

function humanTxStatus(tx: PendingTx) {
  if (tx.status === "awaiting-signature") return "Awaiting wallet signature.";
  if (tx.status === "submitted") return "Submitted to Shannon and waiting for confirmation.";
  if (tx.status === "confirmed") return "Confirmed onchain.";
  return "Failed before completion.";
}

function SignalItem({
  label,
  tone = "default",
  value,
}: {
  label: string;
  tone?: "default" | "signal" | "warning";
  value: string;
}) {
  return (
    <div className="signal-item" data-tone={tone}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function ProductScreenshot({
  snapshot,
  role,
  walletMode,
}: {
  snapshot?: LastWishSnapshot;
  role: "Testator" | "Heir" | "Viewer";
  walletMode: string;
}) {
  const status = snapshot ? statusCopy[snapshot.status].label : "No record loaded";
  const contractLabel = snapshot ? shortAddress(snapshot.contractAddress, 10, 6) : "0x7A91...D4C2";
  const testatorLabel = snapshot ? shortAddress(snapshot.testator, 8, 6) : "Wallet signer";
  const heirLabel = snapshot ? shortAddress(snapshot.heir, 8, 6) : "Named heir";
  const escrowLabel = snapshot ? `${formatStt(snapshot.balanceWei, 2)} STT` : "0.00 STT";
  const requestLabel = snapshot
    ? snapshot.requestId === "0"
      ? "Not requested"
      : `#${snapshot.requestId}`
    : "Ready";

  return (
    <section className="product-shot" aria-label="Last Wish application screen">
      <div className="shot-chrome">
        <div className="shot-rail" aria-hidden="true">
          <span>LW</span>
          <i />
          <i />
          <i />
        </div>

        <div className="shot-main">
          <div className="shot-topbar">
            <div>
              <p className="screen-label">Estate record</p>
              <strong>{contractLabel}</strong>
            </div>
            <div className="screen-state">
              <span>{status}</span>
              <span>{networkConfig.name}</span>
            </div>
          </div>

          <div className="shot-content">
            <div className="screen-left">
              <div className="state-track">
                {stateSequence.map((item, index) => (
                  <div className="track-row" data-active={snapshot?.status === item.key} key={item.key}>
                    <span className="track-index">{String(index + 1).padStart(2, "0")}</span>
                    <span>{statusCopy[item.key].label}</span>
                  </div>
                ))}
              </div>

              <div className="release-gate">
                <span className="screen-label">Release gate</span>
                <strong>{snapshot ? statusCopy[snapshot.status].signal : "Waiting for a loaded record."}</strong>
                <div className="gate-bars" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                  <i />
                  <i />
                </div>
              </div>
            </div>

            <div className="screen-center">
              <div className="screen-table">
                <div className="table-row table-head">
                  <span>Field</span>
                  <span>Value</span>
                  <span>State</span>
                </div>
                <ScreenRow label="Testator" value={testatorLabel} state="Origin" />
                <ScreenRow label="Heir" value={heirLabel} state={role === "Heir" ? "Signer" : "Locked"} />
                <ScreenRow label="Escrow" value={escrowLabel} state="Held" />
                <ScreenRow label="Request" value={requestLabel} state={snapshot?.requestId === "0" ? "Idle" : "Posted"} />
                <ScreenRow
                  label="Verdict"
                  value={snapshot?.verdict || "Awaiting verdict"}
                  state={snapshot?.status === "Confirmed" ? "Cleared" : "Blocked"}
                />
              </div>
            </div>

            <div className="screen-right">
              <div className="action-stack">
                <span className="screen-label">Action bay</span>
                <ScreenAction label="Fund" enabled={!snapshot || snapshot.status === "Active"} />
                <ScreenAction label="Verify" enabled={!snapshot || snapshot.status === "Active"} />
                <ScreenAction label="Claim" enabled={snapshot?.status === "Confirmed" && role === "Heir"} />
                <ScreenAction label="Reset" enabled={snapshot?.status === "Failed" && role === "Testator"} />
              </div>

              <div className="screen-metrics">
                <MetricPair label="Wallet mode" value={walletMode} />
                <MetricPair
                  label="Request deposit"
                  value={`${formatStt(snapshot?.requestDepositWei ?? networkConfig.requestDepositWei, 2)} STT`}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function ScreenRow({ label, state, value }: { label: string; state: string; value: string }) {
  return (
    <div className="table-row">
      <span>{label}</span>
      <strong>{value}</strong>
      <em>{state}</em>
    </div>
  );
}

function ScreenAction({ enabled, label }: { enabled: boolean; label: string }) {
  return (
    <div className="screen-action" data-enabled={enabled}>
      <span>{label}</span>
      <strong>{enabled ? "Ready" : "Blocked"}</strong>
    </div>
  );
}

function MetricPair({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric-pair">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function PanelKicker({ label }: { label: string }) {
  return <p className="panel-kicker">{label}</p>;
}

function SummaryPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="summary-pill">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function MatrixRow({ actor, action, gate }: { actor: string; action: string; gate: string }) {
  return (
    <div className="matrix-row">
      <span>{actor}</span>
      <strong>{action}</strong>
      <em>{gate}</em>
    </div>
  );
}

function Banner({
  action,
  body,
  title,
  tone,
}: {
  action?: React.ReactNode;
  body: string;
  title: string;
  tone: "neutral" | "success" | "warning" | "error";
}) {
  return (
    <div className="banner" data-tone={tone} role={tone === "error" ? "alert" : "status"}>
      <div>
        <strong>{title}</strong>
        <p>{body}</p>
      </div>
      {action}
    </div>
  );
}

function PanelHeading({
  eyebrow,
  title,
  body,
}: {
  eyebrow: string;
  title: string;
  body: string;
}) {
  return (
    <div className="panel-heading">
      <p className="eyebrow">{eyebrow}</p>
      <h3>{title}</h3>
      <p>{body}</p>
    </div>
  );
}

function TextField({
  autoComplete,
  error,
  helper,
  id,
  inputMode,
  label,
  onChange,
  pattern,
  placeholder,
  spellCheck,
  type = "text",
  value,
}: {
  autoComplete?: string;
  error?: string;
  helper: string;
  id: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  label: string;
  onChange: (value: string) => void;
  pattern?: string;
  placeholder: string;
  spellCheck?: boolean;
  type?: React.HTMLInputTypeAttribute;
  value: string;
}) {
  const helperId = `${id}-helper`;
  const errorId = `${id}-error`;

  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        aria-describedby={error ? errorId : helperId}
        aria-invalid={error ? "true" : undefined}
        autoComplete={autoComplete}
        inputMode={inputMode}
        pattern={pattern}
        placeholder={placeholder}
        spellCheck={spellCheck}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      {error ? (
        <p className="field-error" id={errorId}>
          {error}
        </p>
      ) : (
        <p className="field-helper" id={helperId}>
          {helper}
        </p>
      )}
    </div>
  );
}

function LedgerRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </>
  );
}

function EvidenceRecord({
  label,
  mono,
  value,
}: {
  label: string;
  mono?: boolean;
  value: React.ReactNode;
}) {
  return (
    <article className="record-card">
      <span>{label}</span>
      <strong className={mono ? "mono" : undefined}>{value}</strong>
    </article>
  );
}

function AddressRecord({
  explorerHref,
  label,
  onCopy,
  value,
}: {
  explorerHref?: string;
  label: string;
  onCopy: (value: string, label: string) => Promise<void>;
  value: string;
}) {
  return (
    <article className="record-card">
      <span>{label}</span>
      <strong className="mono" title={value}>
        {shortAddress(value, 10, 6)}
      </strong>
      <div className="record-actions">
        <button className="inline-control" type="button" onClick={() => void onCopy(value, label)}>
          <Copy aria-hidden="true" size={14} />
          Copy
        </button>
        {explorerHref && (
          <a className="text-link" href={explorerHref} target="_blank" rel="noreferrer">
            Explorer <ExternalLink aria-hidden="true" size={14} />
          </a>
        )}
      </div>
    </article>
  );
}

function StatusPill({ status }: { status: WillStatus }) {
  return (
    <span className="status-pill" data-status={status}>
      {statusCopy[status].label}
    </span>
  );
}

function RolePill({ role }: { role: "Testator" | "Heir" | "Viewer" }) {
  return <span className="role-pill">{role}</span>;
}

function CaseTag({ label }: { label: string }) {
  return <span className="case-tag">{label}</span>;
}

function StateCard({
  actionLabel,
  body,
  icon,
  onAction,
  title,
  tone,
}: {
  actionLabel?: string;
  body: string;
  icon: React.ReactNode;
  onAction?: () => void;
  title: string;
  tone: "neutral" | "error";
}) {
  return (
    <div className="state-card" data-tone={tone}>
      {icon}
      <div>
        <strong>{title}</strong>
        <p>{body}</p>
        {actionLabel && onAction && (
          <button className="button button-secondary state-card-button" type="button" onClick={onAction}>
            {actionLabel}
          </button>
        )}
      </div>
    </div>
  );
}

function SnapshotSkeleton({
  subtitle,
  title,
}: {
  subtitle: string;
  title: string;
}) {
  return (
    <div className="skeleton-stack" aria-hidden="true">
      <div className="skeleton-copy">
        <strong>{title}</strong>
        <p>{subtitle}</p>
      </div>
      <div className="skeleton-banner" />
      <div className="skeleton-line skeleton-title" />
      <div className="skeleton-line" />
      <div className="skeleton-grid">
        {Array.from({ length: 6 }).map((_, index) => (
          <div className="skeleton-card" key={index} />
        ))}
      </div>
    </div>
  );
}

function ActionState({ enabled, reason }: { enabled: boolean; reason: string }) {
  return (
    <span className={cn("action-state", enabled ? "action-state-on" : "action-state-off")}>
      {enabled ? "Ready" : reason}
    </span>
  );
}
