// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

interface IKey {
  function mint(
    address to,
    uint256 id,
    uint256 amount,
    bytes memory data
  ) external;

  function burn(address to, uint256 id, uint256 amount) external;

  function priceOf(uint256 id) external view returns (uint256);

  function priceOfBatch(
    uint256[] memory ids
  ) external view returns (uint256[] memory);

  function sellPriceOf(uint256 id) external view returns (uint256);

  function sellPriceOfBatch(
    uint256[] memory ids
  ) external view returns (uint256[] memory);
}
