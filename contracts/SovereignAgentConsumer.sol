// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IRitualWallet {
    function deposit(uint256 lockDuration) external payable;
    function depositFor(address user, uint256 lockDuration) external payable;
    function withdraw(uint256 amount) external;
    function balanceOf(address user) external view returns (uint256);
    function lockUntil(address user) external view returns (uint256);
}

interface ISovereignAgentFactory {
    function deployHarness(bytes32 userSalt) external returns (address harness);
    function predictHarness(address owner, bytes32 userSalt) external view returns (address harness, bytes32 childSalt);
}

contract SovereignAgentConsumer {
    IRitualWallet constant WALLET = IRitualWallet(0x532F0dF0896F353d8C3DD8cc134e8129DA2a3948);
    ISovereignAgentFactory constant SOVEREIGN_FACTORY = ISovereignAgentFactory(0x9dC4C054e53bCc4Ce0A0Ff09E890A7a8e817f304);
    address constant SOVEREIGN_PRECOMPILE = address(0x080C);
    address constant ASYNC_DELIVERY = 0x5A16214fF555848411544b005f7Ac063742f39F6;

    address public owner;
    address public deployedHarness;
    bytes32 public lastJobId;
    bytes public lastResult;

    event HarnessDeployed(address indexed harness, bytes32 indexed userSalt);
    event SovereignJobSubmitted(bytes32 indexed jobId);
    event SovereignResultDelivered(bytes32 indexed jobId, bytes result);
    event DepositMade(address indexed user, uint256 amount, uint256 lockUntil);
    event WithdrawalMade(address indexed user, uint256 amount);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    modifier onlyAsyncDelivery() {
        require(msg.sender == ASYNC_DELIVERY, "Only AsyncDelivery");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    function depositFees(uint256 lockBlocks) external payable onlyOwner {
        WALLET.deposit{value: msg.value}(lockBlocks);
        emit DepositMade(msg.sender, msg.value, block.number + lockBlocks);
    }

    function checkFeeBalance() external view returns (uint256 balance, uint256 lockExpiry, bool isLocked) {
        balance = WALLET.balanceOf(address(this));
        lockExpiry = WALLET.lockUntil(address(this));
        isLocked = block.number < lockExpiry;
    }

    function withdrawFees(uint256 amount) external onlyOwner {
        require(block.number >= WALLET.lockUntil(address(this)), "Still locked");
        WALLET.withdraw(amount);
        emit WithdrawalMade(msg.sender, amount);
    }

    function deploySovereignHarness(bytes32 userSalt) external onlyOwner returns (address harness) {
        harness = SOVEREIGN_FACTORY.deployHarness(userSalt);
        deployedHarness = harness;
        emit HarnessDeployed(harness, userSalt);
    }

    function predictHarness(bytes32 userSalt) external view returns (address harness) {
        (harness, ) = SOVEREIGN_FACTORY.predictHarness(address(this), userSalt);
    }

    function submitSovereignJob(bytes calldata encodedInput) external onlyOwner returns (bytes32 jobId) {
        require(deployedHarness != address(0), "Harness not deployed");
        (bool ok, bytes memory output) = SOVEREIGN_PRECOMPILE.call(encodedInput);
        require(ok, "Sovereign precompile call failed");
        jobId = keccak256(output);
        lastJobId = jobId;
        emit SovereignJobSubmitted(jobId);
    }

    function onSovereignAgentResult(bytes32 jobId, bytes calldata result) external onlyAsyncDelivery {
        lastResult = result;
        emit SovereignResultDelivered(jobId, result);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        owner = newOwner;
    }

    receive() external payable {}
}
