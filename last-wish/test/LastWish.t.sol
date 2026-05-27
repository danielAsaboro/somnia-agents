// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {LastWish} from "../contracts/LastWish.sol";
import {ResponseStatus} from "../contracts/somnia/ISomniaAgents.sol";
import {MockPlatform} from "./MockPlatform.sol";

interface Vm {
    function deal(address who, uint256 newBalance) external;
    function prank(address msgSender) external;
    function etch(address target, bytes calldata code) external;
}

contract LastWishTest {
    Vm internal constant VM = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    MockPlatform internal platform;
    LastWish internal will;

    address internal heir = address(0xBEEF);
    address internal testator;

    receive() external payable {}

    function setUp() public {
        platform = new MockPlatform();
        // Point the LastWish PLATFORM constant at the mock by etching the
        // mock's bytecode at the canonical Somnia platform address.
        VM.etch(0x7407cb35a17D511D1Bd32dD726ADb8D5344ECbE3, address(platform).code);

        testator = address(this);
        VM.deal(testator, 100 ether);
        will = new LastWish{value: 5 ether}(
            heir,
            "https://www.legacy.com/obituaries/jane-doe",
            "Is the obituary for Jane Doe present on this page?",
            uint8(95)
        );
    }

    function test_HappyPath_Confirmed_Then_HeirClaims() public {
        uint256 reqId = will.verifyObituary{value: 0.12 ether}();
        require(will.status() == LastWish.WillStatus.VerificationPending, "status");
        require(will.requestId() == reqId, "request id stored");

        MockPlatform mock =
            MockPlatform(payable(0x7407cb35a17D511D1Bd32dD726ADb8D5344ECbE3));
        mock.respondString(address(will), reqId, "confirmed");

        require(will.status() == LastWish.WillStatus.Confirmed, "not confirmed");
        require(address(will).balance == 5 ether, "balance moved early");

        uint256 heirBefore = heir.balance;
        VM.prank(heir);
        will.claim();
        require(heir.balance == heirBefore + 5 ether, "heir not paid");
        require(will.status() == LastWish.WillStatus.Claimed, "claim status");
    }

    function test_Verdict_NotConfirmed_Fails_TestatorResets() public {
        uint256 reqId = will.verifyObituary{value: 0.12 ether}();
        MockPlatform mock =
            MockPlatform(payable(0x7407cb35a17D511D1Bd32dD726ADb8D5344ECbE3));
        mock.respondString(address(will), reqId, "not confirmed");

        require(will.status() == LastWish.WillStatus.Failed, "failed status");
        will.resetAfterFailure();
        require(will.status() == LastWish.WillStatus.Active, "reset");
    }

    function test_PlatformTimeout_MarksFailed() public {
        uint256 reqId = will.verifyObituary{value: 0.12 ether}();
        MockPlatform mock =
            MockPlatform(payable(0x7407cb35a17D511D1Bd32dD726ADb8D5344ECbE3));
        mock.respondStatus(address(will), reqId, ResponseStatus.TimedOut);
        require(will.status() == LastWish.WillStatus.Failed, "timeout->failed");
    }
}
