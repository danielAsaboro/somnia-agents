// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {
    IAgentRequester,
    IAgentRequesterHandler,
    IParseWebsiteAgent,
    Request,
    Response,
    ResponseStatus,
    SomniaAgents
} from "./somnia/ISomniaAgents.sol";

/// @title LastWish
/// @notice Posthumous escrow: testator funds the contract while alive; on death
///         the ParseWebsite agent verifies an obituary at a chosen URL and the
///         contract releases STT to a single heir.
/// @dev V1 demo scope from ideas/last-wish/README.md: one testator, one heir,
///      one obituary URL, lump-sum payout. Conditional-trust variant deferred.
contract LastWish is IAgentRequesterHandler {
    enum WillStatus {
        Active,
        VerificationPending,
        Confirmed,
        Failed,
        Claimed
    }

    address public immutable testator;
    address public immutable heir;
    string public obituaryUrl;
    string public obituaryQuery;
    uint8 public immutable minConfidencePct;

    WillStatus public status;
    uint256 public requestId;
    string public verdict;
    uint256 public confirmedAt;

    IAgentRequester public constant PLATFORM = IAgentRequester(SomniaAgents.PLATFORM);
    uint256 public constant REQUEST_DEPOSIT = SomniaAgents.DEFAULT_REQUEST_DEPOSIT;

    event WillFunded(address indexed testator, uint256 amount);
    event VerificationRequested(uint256 indexed requestId, string url, string query);
    event ObituaryVerdict(uint256 indexed requestId, string verdict, ResponseStatus status);
    event Distributed(address indexed heir, uint256 amount);

    error OnlyPlatform();
    error OnlyTestator();
    error WrongStatus();
    error UnderfundedDeposit();
    error NothingToClaim();
    error TransferFailed();

    constructor(
        address heir_,
        string memory obituaryUrl_,
        string memory obituaryQuery_,
        uint8 minConfidencePct_
    ) payable {
        testator = msg.sender;
        heir = heir_;
        obituaryUrl = obituaryUrl_;
        obituaryQuery = obituaryQuery_;
        minConfidencePct = minConfidencePct_;
        status = WillStatus.Active;
        if (msg.value > 0) emit WillFunded(msg.sender, msg.value);
    }

    /// @notice Add to the inheritance escrow at any time before verification.
    function fund() external payable {
        if (status != WillStatus.Active) revert WrongStatus();
        emit WillFunded(msg.sender, msg.value);
    }

    /// @notice Permissionless trigger: anyone can pay the request deposit to
    ///         have the ParseWebsite agent attest the obituary.
    function verifyObituary() external payable returns (uint256) {
        if (status != WillStatus.Active) revert WrongStatus();
        if (msg.value < REQUEST_DEPOSIT) revert UnderfundedDeposit();

        string[] memory allowed = new string[](3);
        allowed[0] = "confirmed";
        allowed[1] = "not confirmed";
        allowed[2] = "ambiguous";

        bytes memory payload = abi.encodeWithSelector(
            IParseWebsiteAgent.ExtractString.selector,
            "obituary_status",
            "Whether the testator's obituary appears at the given URL",
            allowed,
            obituaryQuery,
            obituaryUrl,
            false,
            uint8(2)
        );

        requestId = PLATFORM.createRequest{value: REQUEST_DEPOSIT}(
            SomniaAgents.PARSE_WEBSITE_AGENT_ID,
            address(this),
            this.handleResponse.selector,
            payload
        );

        status = WillStatus.VerificationPending;
        emit VerificationRequested(requestId, obituaryUrl, obituaryQuery);

        uint256 refund = msg.value - REQUEST_DEPOSIT;
        if (refund > 0) {
            (bool ok,) = msg.sender.call{value: refund}("");
            if (!ok) revert TransferFailed();
        }
        return requestId;
    }

    /// @inheritdoc IAgentRequesterHandler
    function handleResponse(
        uint256 requestId_,
        Response[] memory responses,
        ResponseStatus respStatus,
        Request memory /* details */
    ) external override {
        if (msg.sender != address(PLATFORM)) revert OnlyPlatform();
        if (status != WillStatus.VerificationPending) revert WrongStatus();
        if (requestId_ != requestId) revert WrongStatus();

        if (respStatus != ResponseStatus.Success || responses.length == 0) {
            status = WillStatus.Failed;
            emit ObituaryVerdict(requestId_, "", respStatus);
            return;
        }

        string memory result = abi.decode(responses[0].result, (string));
        verdict = result;
        emit ObituaryVerdict(requestId_, result, respStatus);

        if (_isConfirmed(result)) {
            status = WillStatus.Confirmed;
            confirmedAt = block.timestamp;
        } else {
            status = WillStatus.Failed;
        }
    }

    /// @notice After verification succeeds, the heir withdraws the escrow.
    function claim() external {
        if (status != WillStatus.Confirmed) revert WrongStatus();
        if (msg.sender != heir) revert OnlyTestator();
        uint256 bal = address(this).balance;
        if (bal == 0) revert NothingToClaim();
        status = WillStatus.Claimed;
        (bool ok,) = heir.call{value: bal}("");
        if (!ok) revert TransferFailed();
        emit Distributed(heir, bal);
    }

    /// @notice After a failed verification the will resets to Active so the
    ///         testator (still alive) or a future caller can retry. Only the
    ///         testator may reset — prevents griefing by repeated failure.
    function resetAfterFailure() external {
        if (msg.sender != testator) revert OnlyTestator();
        if (status != WillStatus.Failed) revert WrongStatus();
        status = WillStatus.Active;
        verdict = "";
        requestId = 0;
    }

    function _isConfirmed(string memory s) private pure returns (bool) {
        return keccak256(bytes(s)) == keccak256(bytes("confirmed"));
    }

    receive() external payable {
        if (status == WillStatus.Active) emit WillFunded(msg.sender, msg.value);
    }
}
