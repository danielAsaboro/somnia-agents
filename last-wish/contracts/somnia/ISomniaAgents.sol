// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

// Mirror of Somnia's agent platform interface; kept local so contracts under
// src/contracts/ideas/ can compile against a single canonical header rather
// than reaching into the resources/ examples tree.

enum ConsensusType {
    Majority,
    Threshold
}

enum ResponseStatus {
    None,
    Pending,
    Success,
    Failed,
    TimedOut
}

struct Response {
    address validator;
    bytes result;
    ResponseStatus status;
    uint256 receipt;
    uint256 timestamp;
    uint256 executionCost;
}

struct Request {
    uint256 id;
    address requester;
    address callbackAddress;
    bytes4 callbackSelector;
    address[] subcommittee;
    Response[] responses;
    uint256 responseCount;
    uint256 failureCount;
    uint256 threshold;
    uint256 createdAt;
    uint256 deadline;
    ResponseStatus status;
    ConsensusType consensusType;
    uint256 remainingBudget;
}

interface IAgentRequester {
    function createRequest(
        uint256 agentId,
        address callbackAddress,
        bytes4 callbackSelector,
        bytes calldata payload
    ) external payable returns (uint256 requestId);

    function createAdvancedRequest(
        uint256 agentId,
        address callbackAddress,
        bytes4 callbackSelector,
        bytes calldata payload,
        uint256 subcommitteeSize,
        uint256 threshold,
        ConsensusType consensusType,
        uint256 timeout
    ) external payable returns (uint256 requestId);

    function getRequest(uint256 requestId) external view returns (Request memory);
    function hasRequest(uint256 requestId) external view returns (bool);
    function getRequestDeposit() external view returns (uint256);
    function getAdvancedRequestDeposit(uint256 subcommitteeSize) external view returns (uint256);
}

interface IAgentRequesterHandler {
    function handleResponse(
        uint256 requestId,
        Response[] memory responses,
        ResponseStatus status,
        Request memory details
    ) external;
}

interface IJsonApiAgent {
    function fetchString(string calldata url, string calldata selector)
        external
        returns (string memory);
    function fetchUint(string calldata url, string calldata selector, uint8 decimals)
        external
        returns (uint256);
    function fetchBool(string calldata url, string calldata selector) external returns (bool);
}

interface ILLMAgent {
    function inferString(
        string calldata prompt,
        string calldata system,
        bool chainOfThought,
        string[] calldata allowedValues
    ) external returns (string memory);
}

interface IParseWebsiteAgent {
    function ExtractString(
        string calldata key,
        string calldata description,
        string[] calldata options,
        string calldata prompt,
        string calldata url,
        bool resolveUrl,
        uint8 numPages
    ) external returns (string memory);

    function ExtractANumber(
        string calldata key,
        string calldata description,
        uint256 min,
        uint256 max,
        string calldata prompt,
        string calldata url,
        bool resolveUrl,
        uint8 numPages
    ) external returns (uint256);
}

// Platform-published agent IDs (see resources/Somnia-Agentic-examples).
library SomniaAgents {
    address internal constant PLATFORM = 0x7407cb35a17D511D1Bd32dD726ADb8D5344ECbE3;

    uint256 internal constant LLM_AGENT_ID = 13_174_292_974_160_097_713;
    uint256 internal constant PARSE_WEBSITE_AGENT_ID = 12_875_401_142_070_969_085;
    uint256 internal constant JSON_API_AGENT_ID = 13_174_292_974_160_097_713;

    uint256 internal constant DEFAULT_REQUEST_DEPOSIT = 0.12 ether;
}
