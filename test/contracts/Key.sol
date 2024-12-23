// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/token/ERC1155/ERC1155Upgradeable.sol";
import {UD60x18, ud} from "@prb/math/src/UD60x18.sol";
import "../abstract/AbstractRole.sol";
import "../interfaces/IKey.sol";

contract Key is IKey, AbstractRole, ERC1155Upgradeable {
    event IssueLimitUpdated(uint256 issueLimit);

    mapping(uint256 => uint256) public totalSupply;

    uint256 public issueLimit;

    function __init(string memory uri_, uint256 issueLimit_) private {
        __AccessControl_init();
        __ERC1155_init(uri_);

        address sender = _msgSender();
        _grantRole(DEFAULT_ADMIN_ROLE, sender);
        _grantRole(OPERATOR_ROLE, sender);

        issueLimit = issueLimit_;
    }

    function initialize(
        string memory uri_,
        uint256 issueLimit_
    ) public initializer {
        __init(uri_, issueLimit_);
    }

    function mint(
        address to,
        uint256 id,
        uint256 amount,
        bytes memory data
    ) external override onlyRole(MINTER_ROLE) {
        require(totalSupply[id] + amount <= issueLimit, "KEY_ISSUE_LIMIT");
        _mint(to, id, amount, data);

        totalSupply[id] += amount;
    }

    function burn(
        address account,
        uint256 id,
        uint256 amount_
    ) external override {
        require(
            account == _msgSender() || isApprovedForAll(account, _msgSender()),
            "KEY_CALLER_NOT_OWNER_NOR_APPROVED"
        );

        _burn(account, id, amount_);

        totalSupply[id] -= amount_;
    }

    function _priceOf(uint256 index_) public pure returns (uint256) {
        UD60x18 exponent = ud(1.53e18);
        UD60x18 amount = ud(index_ * 1e18);
        UD60x18 divisor = ud(1600 * 1e18);
        UD60x18 multiple = ud(1e18);

        UD60x18 result = (amount.pow(exponent)).div(divisor).mul(multiple);

        return result.unwrap();
    }

    function priceOf(uint256 id_) external view override returns (uint256) {
        return _priceOf(totalSupply[id_]);
    }

    function priceOfBatch(
        uint256[] memory ids
    ) external view override returns (uint256[] memory) {
        uint256[] memory batchPrices = new uint256[](ids.length);
        for (uint256 i = 0; i < ids.length; ++i) {
            batchPrices[i] = _priceOf(totalSupply[ids[i]]);
        }

        return batchPrices;
    }

    function sellPriceOf(uint256 id_) external view override returns (uint256) {
        return _priceOf(totalSupply[id_] - 1);
    }

    function sellPriceOfBatch(
        uint256[] memory ids
    ) external view override returns (uint256[] memory) {
        uint256[] memory batchPrices = new uint256[](ids.length);
        for (uint256 i = 0; i < ids.length; ++i) {
            batchPrices[i] = _priceOf(totalSupply[ids[i]] - 1);
        }

        return batchPrices;
    }

    function supportsInterface(
        bytes4 interfaceId
    )
        public
        view
        virtual
        override(AccessControlUpgradeable, ERC1155Upgradeable)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }

    function setIssueLimit(
        uint256 issueLimit_
    ) external onlyRole(OPERATOR_ROLE) {
        issueLimit = issueLimit_;

        emit IssueLimitUpdated(issueLimit);
    }

    function availableToBuy(uint256 id) external view returns (uint256) {
        uint256 totalBuy = totalSupply[id];
        if (issueLimit > totalBuy) {
            return issueLimit - totalBuy;
        }
        return 0;
    }
}
