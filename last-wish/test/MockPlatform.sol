// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {
    ConsensusType,
    IAgentRequester,
    IAgentRequesterHandler,
    Request,
    Response,
    ResponseStatus
} from "../contracts/somnia/ISomniaAgents.sol";

/// @notice Test double for IAgentRequester used by every ideas/ contract.
/// Lets a test capture the last request and synthesize success / failure
/// callbacks against the requester's handler.
contract MockPlatform is IAgentRequester {
    uint256 public nextRequestId = 100;
    uint256 public deposit = 0.12 ether;

    uint256 public lastAgentId;
    address public lastCallbackAddress;
    bytes4 public lastCallbackSelector;
    bytes public lastPayload;
    uint256 public lastValue;

    function setDeposit(uint256 d) external {
        deposit = d;
    }

    function getRequestDeposit() external view returns (uint256) {
        return deposit;
    }

    function getAdvancedRequestDeposit(uint256) external view returns (uint256) {
        return deposit;
    }

    function hasRequest(uint256) external pure returns (bool) {
        return true;
    }

    function getRequest(uint256) external pure returns (Request memory r) {
        return r;
    }

    function createRequest(
        uint256 agentId,
        address callbackAddress,
        bytes4 callbackSelector,
        bytes calldata payload
    ) external payable returns (uint256 requestId) {
        requestId = nextRequestId++;
        lastAgentId = agentId;
        lastCallbackAddress = callbackAddress;
        lastCallbackSelector = callbackSelector;
        lastPayload = payload;
        lastValue = msg.value;
    }

    function createAdvancedRequest(
        uint256 agentId,
        address callbackAddress,
        bytes4 callbackSelector,
        bytes calldata payload,
        uint256,
        uint256,
        ConsensusType,
        uint256
    ) external payable returns (uint256 requestId) {
        requestId = nextRequestId++;
        lastAgentId = agentId;
        lastCallbackAddress = callbackAddress;
        lastCallbackSelector = callbackSelector;
        lastPayload = payload;
        lastValue = msg.value;
    }

    function respondString(address target, uint256 requestId, string memory value) external {
        Response[] memory responses = new Response[](1);
        responses[0] = Response({
            validator: address(this),
            result: abi.encode(value),
            status: ResponseStatus.Success,
            receipt: 0,
            timestamp: block.timestamp,
            executionCost: 0
        });
        IAgentRequesterHandler(target).handleResponse(
            requestId, responses, ResponseStatus.Success, _emptyRequest(target)
        );
    }

    function respondUint(address target, uint256 requestId, uint256 value) external {
        Response[] memory responses = new Response[](1);
        responses[0] = Response({
            validator: address(this),
            result: abi.encode(value),
            status: ResponseStatus.Success,
            receipt: 0,
            timestamp: block.timestamp,
            executionCost: 0
        });
        IAgentRequesterHandler(target).handleResponse(
            requestId, responses, ResponseStatus.Success, _emptyRequest(target)
        );
    }

    function respondStatus(address target, uint256 requestId, ResponseStatus status) external {
        Response[] memory responses = new Response[](0);
        IAgentRequesterHandler(target).handleResponse(
            requestId, responses, status, _emptyRequest(target)
        );
    }

    function _emptyRequest(address target) private view returns (Request memory r) {
        r.id = 0;
        r.requester = address(this);
        r.callbackAddress = target;
        r.callbackSelector = lastCallbackSelector;
        r.subcommittee = new address[](0);
        r.responses = new Response[](0);
        r.responseCount = 0;
        r.failureCount = 0;
        r.threshold = 0;
        r.createdAt = block.timestamp;
        r.deadline = block.timestamp + 1 hours;
        r.status = ResponseStatus.Success;
        r.consensusType = ConsensusType.Majority;
        r.remainingBudget = 0;
    }
}
