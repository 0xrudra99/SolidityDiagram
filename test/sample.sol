// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title Sample Contract for Testing Solidity Diagram Extension
 * @notice This contract demonstrates various Solidity features for diagram generation
 */
contract SampleContract {
    // ============ Structs ============

    /// @notice Reserve configuration. Subset of the `Reserve` struct.
    /// @dev collateralRisk The risk associated with a collateral asset, expressed in BPS.
    /// @dev paused True if all actions are prevented for the reserve.
    /// @dev frozen True if new activity is prevented for the reserve.
    /// @dev borrowable True if the reserve is borrowable.
    /// @dev liquidatable True if the reserve can be liquidated when used as collateral.
    /// @dev receiveSharesEnabled True if the liquidator can receive collateral shares during liquidation.
    struct ReserveConfig {
        uint24 collateralRisk;
        bool paused;
        bool frozen;
        bool borrowable;
        bool liquidatable;
        bool receiveSharesEnabled;
    }

    /// @notice Dynamic configuration for reserves that can be updated frequently
    struct DynamicReserveConfig {
        uint256 collateralFactor;
        uint256 maxLiquidationBonus;
        uint256 liquidationFee;
    }

    /// @notice User position data
    struct UserPosition {
        uint256 depositAmount;
        uint256 borrowAmount;
        uint256 lastUpdateTimestamp;
    }

    // ============ State Variables ============

    uint256 public constant MAX_ALLOWED_COLLATERAL_RISK = 10000;
    uint256 public constant MAX_ALLOWED_ASSET_ID = 255;
    uint256 private _reserveCount;

    mapping(address => mapping(uint256 => bool)) private _reserveExists;
    mapping(uint256 => ReserveConfig) private _reserveConfigs;
    mapping(uint256 => address) private _priceSources;

    // ============ Events ============

    event ReserveAdded(uint256 indexed reserveId, address indexed hub, address priceSource);
    event UpdateReservePriceSource(uint256 indexed reserveId, address priceSource);

    // ============ Errors ============

    error InvalidAddress();
    error InvalidAssetId();
    error ReserveExists();
    error AssetNotListed();
    error InvalidCollateralRisk();
    error InvalidCollateralFactorAndMaxLiquidationBonus();
    error InvalidLiquidationFee();

    // ============ External Functions ============

    /**
     * @notice Add a new reserve to the protocol
     * @param hub The address of the hub contract
     * @param assetId The ID of the asset
     * @param priceSource The address of the price oracle
     * @param config The reserve configuration
     * @param dynamicConfig The dynamic reserve configuration
     * @return reserveId The ID of the newly created reserve
     */
    function addReserve(
        address hub,
        uint256 assetId,
        address priceSource,
        ReserveConfig calldata config,
        DynamicReserveConfig calldata dynamicConfig
    ) external returns (uint256) {
        require(hub != address(0), InvalidAddress());
        require(assetId <= MAX_ALLOWED_ASSET_ID, InvalidAssetId());
        require(!_reserveExists[hub][assetId], ReserveExists());

        // Validating if the collateral risk is within the allowed range
        _validateReserveConfig(config);
        _validateDynamicReserveConfig(dynamicConfig);

        uint256 reserveId = _reserveCount++;
        uint24 dynamicConfigKey; // 0 as first key to use

        (address underlying, uint8 decimals) = _getAssetUnderlyingAndDecimals(hub, assetId);
        require(underlying != address(0), AssetNotListed());

        // Assets we are trying to add needs to be whitelisted within the liquidity pod
        _updateReservePriceSource(reserveId, priceSource);

        _reserveConfigs[reserveId] = config;
        _reserveExists[hub][assetId] = true;

        emit ReserveAdded(reserveId, hub, priceSource);

        return reserveId;
    }

    /**
     * @notice Get user position for a specific reserve
     * @param user The user address
     * @param reserveId The reserve ID
     * @return position The user's position
     */
    function getUserPosition(
        address user,
        uint256 reserveId
    ) external view returns (UserPosition memory position) {
        position = UserPosition({
            depositAmount: 0,
            borrowAmount: 0,
            lastUpdateTimestamp: block.timestamp
        });
    }

    // ============ Internal Functions ============

    function _validateReserveConfig(ReserveConfig calldata config) internal pure {
        require(config.collateralRisk <= MAX_ALLOWED_COLLATERAL_RISK, InvalidCollateralRisk());
    }

    /// @dev Enforces compatible `maxLiquidationBonus` and `collateralFactor` so at the moment debt is created
    /// there is enough collateral to cover liquidation.
    function _validateDynamicReserveConfig(DynamicReserveConfig calldata config) internal pure {
        require(
            config.collateralFactor < 1e18 &&
            config.maxLiquidationBonus >= 1e18 &&
            config.maxLiquidationBonus * config.collateralFactor < 1e36,
            InvalidCollateralFactorAndMaxLiquidationBonus()
        );

        require(config.liquidationFee <= 1e18, InvalidLiquidationFee());
    }

    function _updateReservePriceSource(uint256 reserveId, address priceSource) internal {
        require(priceSource != address(0), InvalidAddress());
        _priceSources[reserveId] = priceSource;
        emit UpdateReservePriceSource(reserveId, priceSource);
    }

    function _getAssetUnderlyingAndDecimals(
        address hub,
        uint256 assetId
    ) internal view returns (address underlying, uint8 decimals) {
        // Simulated external call
        underlying = hub;
        decimals = 18;
    }
}
