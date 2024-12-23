// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/utils/ContextUpgradeable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/interfaces/IERC1155.sol";
import "../abstract/AbstractRole.sol";
import "../interfaces/IKey.sol";
import "../libs/Signature.sol";

contract DmtpTech is ContextUpgradeable, AbstractRole, ReentrancyGuard {
  using Signature for bytes32;

  uint256 public constant A_HUNDRED_PERCENT = 10_000; // 100%

  event KeyBought(uint256 keyId, address buyer, uint256 price);
  event KeySold(uint256 keyId, address seller, uint256 price);
  event KeyGenerated(uint256 keyId, address kol);
  event SignerSet(address signer);
  event KeyContractUpdated(address key);
  event CommissionUpdated(
    uint256 rate,
    address receiver_,
    uint256 keyGeneratorRate
  );

  struct Commission {
    uint256 rate;
    address receiver;
    uint256 keyGeneratorRate;
  }

  uint256 private _keyIdCounter;
  IKey public key;
  address public signer;

  mapping(address => uint256) public generated;
  Commission public commission;

  mapping(uint256 => address) public keyGenerators;
  bool public needToCheckWhitelist;

  function __init(
    address key_,
    address signer_,
    uint256 commissionRate_,
    address commissionReceiver_,
    uint256 commissionKeyGeneratorRate_
  ) private {
    __Context_init();

    key = IKey(key_);

    address sender = _msgSender();
    _grantRole(DEFAULT_ADMIN_ROLE, sender);
    _grantRole(OPERATOR_ROLE, sender);

    signer = signer_;

    commission.rate = commissionRate_;
    commission.receiver = commissionReceiver_;
    commission.keyGeneratorRate = commissionKeyGeneratorRate_;
  }

  function initialize(
    address key_,
    address signer_,
    uint256 commissionRate_,
    address commissionReceiver_,
    uint256 commissionKeyGeneratorRate_
  ) external initializer {
    __init(
      key_,
      signer_,
      commissionRate_,
      commissionReceiver_,
      commissionKeyGeneratorRate_
    );
  }

  function setSigner(address signer_) external onlyRole(OPERATOR_ROLE) {
    require(signer_ != address(0), "DMTP_TECH_PARAM_ADDRESS_INVALID");

    signer = signer_;

    emit SignerSet(signer_);
  }

  function buyKey(uint256 id_) external payable nonReentrant {
    require(id_ <= _keyIdCounter, "DMTP_TECH_PARAM_KEY_INVALID");

    uint256 price = key.priceOf(id_);

    uint256 fee = (price * commission.rate) / A_HUNDRED_PERCENT;
    uint256 payout = price + fee;

    require(msg.value == payout, "DMTP_TECH_PRICE_CHANGED");

    key.mint(_msgSender(), id_, 1, "");

    uint256 keyGeneratorFee = (price * commission.keyGeneratorRate) /
      A_HUNDRED_PERCENT;
    if (keyGeneratorFee > 0) {
      payable(keyGenerators[id_]).transfer(keyGeneratorFee);
    }

    if (commission.receiver != address(0)) {
      payable(commission.receiver).transfer(fee - keyGeneratorFee);
    }

    emit KeyBought(id_, _msgSender(), price);
  }

  function sellKey(uint256 id_, uint256 price_) external nonReentrant {
    address seller = _msgSender();

    require(allowToSellKey(seller, id_), "DMTP_TECH_NOT_ALLOW_TO_SELL_KEYS");

    uint256 price = key.sellPriceOf(id_);
    require(price_ == price, "DMTP_TECH_PRICE_CHANGED");

    uint256 fee = (price * commission.rate) / A_HUNDRED_PERCENT;
    uint256 payout = price - fee;

    key.burn(seller, id_, 1);

    payable(seller).transfer(payout);

    uint256 keyGeneratorFee = (price * commission.keyGeneratorRate) /
      A_HUNDRED_PERCENT;
    if (keyGeneratorFee > 0) {
      payable(keyGenerators[id_]).transfer(keyGeneratorFee);
    }

    if (commission.receiver != address(0)) {
      payable(commission.receiver).transfer(fee - keyGeneratorFee);
    }

    emit KeySold(id_, seller, price);
  }

  function generateKey(bytes memory signature_) external nonReentrant {
    address sender = _msgSender();
    require(generated[sender] == 0, "DMTP_TECH_ALREADY_ISSUED_KEY");

    if (needToCheckWhitelist) {
      bytes32 message = keccak256(
        abi.encodePacked(sender, block.chainid, address(this))
      ).prefixed();

      require(
        message.recoverSigner(signature_) == signer,
        "DMTP_TECH_PARAM_SIGNATURE_INVALID"
      );
    }

    uint256 id = _keyIdCounter + 1;

    key.mint(_msgSender(), id, 1, "");

    _keyIdCounter = id;
    generated[sender] = id;
    keyGenerators[id] = sender;

    emit KeyGenerated(id, sender);
  }

  function setKeyContract(address key_) external onlyRole(OPERATOR_ROLE) {
    require(key_ != address(0), "DMTP_TECH_PARAM_ADDRESS_INVALID");

    key = IKey(key_);

    emit KeyContractUpdated(key_);
  }

  function setCommission(
    uint256 rate_,
    address receiver_,
    uint256 keyGeneratorRate_
  ) external onlyRole(OPERATOR_ROLE) {
    commission.receiver = receiver_;
    commission.rate = rate_;
    commission.keyGeneratorRate = keyGeneratorRate_;

    emit CommissionUpdated(rate_, receiver_, keyGeneratorRate_);
  }

  function priceWithCommission(
    uint256 id_
  ) external view returns (uint256 price, uint256 fee, uint256 payout) {
    price = key.priceOf(id_);
    fee = (price * commission.rate) / A_HUNDRED_PERCENT;
    payout = price + fee;
    return (price, fee, payout);
  }

  function sellPriceWithCommission(
    uint256 id_
  ) external view returns (uint256 price, uint256 fee, uint256 payout) {
    price = key.sellPriceOf(id_);
    fee = (price * commission.rate) / A_HUNDRED_PERCENT;
    payout = price - fee;
    return (price, fee, payout);
  }

  function setKeyGeneratos(
    uint256 keyId_,
    address account_
  ) external onlyRole(OPERATOR_ROLE) {
    require(
      keyId_ > 0 && keyId_ <= _keyIdCounter,
      "DMTP_TECH_PARAM_KEY_INVALID"
    );
    require(account_ != address(0), "DMTP_TECH_PARAM_ADDRESS_INVALID");

    keyGenerators[keyId_] = account_;
  }

  function allowToSellKey(
    address seller_,
    uint256 id_
  ) public view returns (bool) {
    if (generated[seller_] != id_) {
      return true;
    }

    uint256 balances = IERC1155(address(key)).balanceOf(seller_, id_);
    if (balances > 1) {
      return true;
    }

    return false;
  }

  function setNeedToCheckWhitelist(
    bool check_
  ) external onlyRole(OPERATOR_ROLE) {
    require(check_ != needToCheckWhitelist, "DMTP_TECH_CONFIG_HAS_SET");

    needToCheckWhitelist = check_;
  }

  function buyKeyFor(
    uint256 id_,
    address receiver_
  ) external payable nonReentrant {
    require(id_ <= _keyIdCounter, "DMTP_TECH_PARAM_KEY_INVALID");

    uint256 price = key.priceOf(id_);

    uint256 fee = (price * commission.rate) / A_HUNDRED_PERCENT;
    uint256 payout = price + fee;

    require(msg.value == payout, "DMTP_TECH_PRICE_CHANGED");

    key.mint(receiver_, id_, 1, "");

    uint256 keyGeneratorFee = (price * commission.keyGeneratorRate) /
      A_HUNDRED_PERCENT;
    if (keyGeneratorFee > 0) {
      payable(keyGenerators[id_]).transfer(keyGeneratorFee);
    }

    if (commission.receiver != address(0)) {
      payable(commission.receiver).transfer(fee - keyGeneratorFee);
    }

    emit KeyBought(id_, receiver_, price);
  }
}
