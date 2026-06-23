// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * theDAO/log Tally Commit — minimal write-once Merkle root registry for
 * voting tallies.
 *
 * After a proposal's voting deadline passes, the off-chain backend
 * computes a Merkle root over the canonical-ordered set of signed
 * ballots and posts it here via `commit(proposalId, root, ballotCount)`.
 *
 * Once committed, the root is immutable. Any verifier with the public
 * ballots can recompute the Merkle root in their browser and compare —
 * a mismatch is undeniable evidence of post-close ballot tampering.
 *
 * The contract has a single admin (the operational wallet that runs
 * the close-vote tx). Admin can be transferred or renounced.
 */
contract TheDAOLogTallyCommit {
    address public admin;

    mapping(string => bytes32) public roots;
    mapping(string => uint256) public ballotCounts;
    mapping(string => uint256) public committedAt;

    event Committed(string indexed proposalId, bytes32 root, uint256 ballotCount);
    event AdminTransferred(address indexed previousAdmin, address indexed newAdmin);

    error NotAdmin();
    error AlreadyCommitted();
    error EmptyRoot();

    constructor(address admin_) {
        admin = admin_;
        emit AdminTransferred(address(0), admin_);
    }

    modifier onlyAdmin() {
        if (msg.sender != admin) revert NotAdmin();
        _;
    }

    function commit(string calldata proposalId, bytes32 root, uint256 ballotCount) external onlyAdmin {
        if (roots[proposalId] != bytes32(0)) revert AlreadyCommitted();
        if (root == bytes32(0)) revert EmptyRoot();
        roots[proposalId] = root;
        ballotCounts[proposalId] = ballotCount;
        committedAt[proposalId] = block.timestamp;
        emit Committed(proposalId, root, ballotCount);
    }

    function transferAdmin(address newAdmin) external onlyAdmin {
        emit AdminTransferred(admin, newAdmin);
        admin = newAdmin;
    }

    function renounceAdmin() external onlyAdmin {
        emit AdminTransferred(admin, address(0));
        admin = address(0);
    }
}
