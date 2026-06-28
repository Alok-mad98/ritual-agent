// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract RitualChatPayment {
    address public owner;
    uint256 public minimumFee;

    struct Payment {
        address payer;
        uint256 fee;
        uint256 timestamp;
        bool exists;
    }

    mapping(bytes32 => Payment) public payments;
    mapping(address => uint256) public balances;
    // payer => sessionKey => remaining allowance
    mapping(address => mapping(address => uint256)) public sessionAllowances;
    mapping(bytes32 => bool) public usedNonces;
    uint256 public totalCollected;

    event QuestionPaid(
        bytes32 indexed questionHash,
        address indexed payer,
        uint256 fee,
        uint256 timestamp
    );

    event SessionApproved(
        address indexed payer,
        address indexed sessionKey,
        uint256 allowance
    );

    event Deposited(address indexed payer, uint256 amount);
    event MinimumFeeUpdated(uint256 newFee);
    event Withdrawn(address indexed to, uint256 amount);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    constructor(uint256 _minimumFee) {
        owner = msg.sender;
        minimumFee = _minimumFee;
    }

    /// @notice Deposit RITUAL balance into the contract to be used for future chat payments.
    function deposit() external payable {
        require(msg.value > 0, "Must deposit > 0");
        balances[msg.sender] += msg.value;
        emit Deposited(msg.sender, msg.value);
    }

    /// @notice Approve a session key to spend up to `allowance` from your deposited balance.
    /// Call this once after deposit. The session key can then sign chat payments off-chain.
    function approveSession(address sessionKey, uint256 allowance) external {
        require(sessionKey != address(0), "Invalid session key");
        sessionAllowances[msg.sender][sessionKey] = allowance;
        emit SessionApproved(msg.sender, sessionKey, allowance);
    }

    /// @notice Direct payment path: user calls this from their wallet each time.
    function payAndAsk(bytes32 questionHash) external payable {
        require(msg.value >= minimumFee, "Fee too low");
        require(!payments[questionHash].exists, "Question already paid");

        _recordPayment(questionHash, msg.sender, msg.value);
    }

    /// @notice Session-key payment path: relayer submits the tx signed by an approved session key.
    /// The user only signs `approveSession()` once. All subsequent chats are auto-signed by the session key.
    function payWithSession(
        bytes32 questionHash,
        uint256 fee,
        uint256 nonce,
        address payer,
        address sessionKey,
        bytes calldata sessionSignature
    ) external {
        require(fee >= minimumFee, "Fee below minimum");
        require(!payments[questionHash].exists, "Question already paid");
        require(balances[payer] >= fee, "Insufficient payer balance");
        require(!usedNonces[keccak256(abi.encodePacked(payer, nonce))], "Nonce used");

        uint256 allowance = sessionAllowances[payer][sessionKey];
        require(allowance >= fee, "Session allowance too low");

        bytes32 messageHash = keccak256(
            abi.encodePacked(questionHash, fee, nonce, payer, sessionKey, address(this))
        );
        bytes32 ethSignedMessageHash = keccak256(
            abi.encodePacked("\x19Ethereum Signed Message:\n32", messageHash)
        );
        require(_recoverSigner(ethSignedMessageHash, sessionSignature) == sessionKey, "Bad session sig");

        usedNonces[keccak256(abi.encodePacked(payer, nonce))] = true;
        balances[payer] -= fee;
        sessionAllowances[payer][sessionKey] = allowance - fee;

        _recordPayment(questionHash, payer, fee);
    }

    function _recordPayment(bytes32 questionHash, address payer, uint256 fee) internal {
        payments[questionHash] = Payment({
            payer: payer,
            fee: fee,
            timestamp: block.timestamp,
            exists: true
        });

        totalCollected += fee;
        emit QuestionPaid(questionHash, payer, fee, block.timestamp);
    }

    /// @notice Recover signer from an EIP-191 signature.
    function _recoverSigner(bytes32 ethSignedMessageHash, bytes memory signature)
        internal
        pure
        returns (address)
    {
        require(signature.length == 65, "Invalid signature length");
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := mload(add(signature, 32))
            s := mload(add(signature, 64))
            v := byte(0, mload(add(signature, 96)))
        }
        return ecrecover(ethSignedMessageHash, v, r, s);
    }

    /// @notice Update the minimum fee required per question.
    function setMinimumFee(uint256 newFee) external onlyOwner {
        minimumFee = newFee;
        emit MinimumFeeUpdated(newFee);
    }

    /// @notice Transfer ownership to a new address (e.g., a multisig).
    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Invalid owner");
        owner = newOwner;
    }

    /// @notice Withdraw collected fees to the owner.
    function withdraw() external onlyOwner {
        uint256 balance = address(this).balance;
        require(balance > 0, "No balance");
        totalCollected = 0;
        (bool success, ) = payable(owner).call{value: balance}("");
        require(success, "Withdraw failed");
        emit Withdrawn(owner, balance);
    }

    /// @notice Get payment details for a question hash.
    function getPayment(bytes32 questionHash)
        external
        view
        returns (Payment memory)
    {
        return payments[questionHash];
    }

    receive() external payable {
        totalCollected += msg.value;
    }
}
