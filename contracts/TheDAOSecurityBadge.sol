// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * theDAO Security Badge — ERC-721 used by theDAO/log to gate vote
 * eligibility (badgeholder role).
 *
 * Roles:
 *   DEFAULT_ADMIN_ROLE — can grant/revoke MINTER_ROLE, change metadata,
 *     transfer admin, renounce. Held by the DAO admin wallet.
 *   MINTER_ROLE — can call safeMint / safeMintBatch. Held by the
 *     operational deployer wallet that handles batch onboarding.
 *
 * All tokens share a single metadata URI (identical visual badge for all
 * holders). Admin can update the URI at any time, e.g. to migrate from
 * a hosted URL to IPFS without redeploying.
 */
contract TheDAOSecurityBadge is ERC721, AccessControl {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    uint256 private _nextId = 1;
    string private _metadataURI;

    event MetadataURISet(string uri);

    constructor(address admin_, address minter_, string memory metadataURI_)
        ERC721("theDAO Security Badge", "TDSB")
    {
        _grantRole(DEFAULT_ADMIN_ROLE, admin_);
        _grantRole(MINTER_ROLE, minter_);
        _metadataURI = metadataURI_;
    }

    function safeMint(address to) external onlyRole(MINTER_ROLE) returns (uint256) {
        uint256 id = _nextId++;
        _safeMint(to, id);
        return id;
    }

    function safeMintBatch(address[] calldata recipients) external onlyRole(MINTER_ROLE) {
        for (uint256 i = 0; i < recipients.length; i++) {
            _safeMint(recipients[i], _nextId++);
        }
    }

    function nextId() external view returns (uint256) {
        return _nextId;
    }

    function setMetadataURI(string calldata newURI) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _metadataURI = newURI;
        emit MetadataURISet(newURI);
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        return _metadataURI;
    }

    function supportsInterface(bytes4 interfaceId)
        public view override(ERC721, AccessControl) returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
