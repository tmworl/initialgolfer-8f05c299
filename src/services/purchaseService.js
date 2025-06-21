// src/services/purchaseService.js
//
// RevenueCat-based purchase service for in-app purchases
// ENHANCED with comprehensive diagnostic tracking for button enablement issues

import { Platform } from 'react-native';
import Purchases from 'react-native-purchases';
import Constants from 'expo-constants';

// Error types for structured error handling (maintaining existing interface)
export const PURCHASE_ERROR_TYPES = {
  CONNECTION: 'connection_error',
  CANCELLED: 'user_cancelled',
  ALREADY_OWNED: 'already_owned',
  NOT_ALLOWED: 'not_allowed',
  UNKNOWN: 'unknown_error',
  SERVER: 'server_error'
};

// Keep your existing product identifiers
const PRODUCT_IDS = {
  ios: 'com.daybeam.golfimprove.product_a',
  android: 'com.daybeam.golfimprove.product_a'
};

// Internal state tracking
let isConfigured = false;
let currentUserId = null;

// DIAGNOSTIC ADDITION: Console-based tracking with structured data
// This ensures we get diagnostic visibility even if PostHog fails
const logDiagnostic = (eventName, properties) => {
  const diagnosticData = {
    event: eventName,
    ...properties,
    timestamp: new Date().toISOString(),
    source: 'revenuecat_service'
  };
  
  // Structured console logging - captured by your existing analytics interception
  console.log(`[REVENUECAT_DIAGNOSTIC] ${eventName}:`, diagnosticData);
};

/**
 * Initialize RevenueCat SDK with user identification
 * ENHANCED with complete initialization state tracking
 * 
 * @param {string} userId - User's profile_id from Supabase
 * @returns {Promise<boolean>} Success status
 */
export async function initializePurchases(userId) {
  const initStartTime = Date.now();
  
  try {
    // DIAGNOSTIC: Track every initialization attempt with environment context
    logDiagnostic('initialization_attempt', {
      user_id: userId,
      platform: Platform.OS,
      api_keys_available: !!Constants.expoConfig?.extra?.revenueCatApiKeys,
      expo_config_available: !!Constants.expoConfig,
      init_start_time: initStartTime
    });

    console.log('Initializing RevenueCat for user:', userId);

    // Get API keys from configuration
    const apiKeys = Constants.expoConfig?.extra?.revenueCatApiKeys;
    if (!apiKeys) {
      // DIAGNOSTIC: Configuration failure - this is a primary cause of button issues
      logDiagnostic('initialization_failed', {
        failure_reason: 'missing_api_keys_config',
        user_id: userId,
        duration_ms: Date.now() - initStartTime,
        expo_config_extra: JSON.stringify(Constants.expoConfig?.extra || {}),
        available_config_keys: JSON.stringify(Object.keys(Constants.expoConfig?.extra || {}))
      });
      
      throw new Error('RevenueCat API keys not found in configuration');
    }

    const apiKey = Platform.OS === 'ios' ? apiKeys.ios : apiKeys.android;
    if (!apiKey) {
      // DIAGNOSTIC: Platform-specific key missing
      logDiagnostic('initialization_failed', {
        failure_reason: 'missing_platform_api_key',
        platform: Platform.OS,
        user_id: userId,
        duration_ms: Date.now() - initStartTime,
        available_platforms: JSON.stringify(Object.keys(apiKeys))
      });
      
      throw new Error(`RevenueCat API key not found for platform: ${Platform.OS}`);
    }

    // DIAGNOSTIC: Track SDK configuration attempt
    logDiagnostic('sdk_configure_attempt', {
      user_id: userId,
      platform: Platform.OS,
      api_key_prefix: `${apiKey.substring(0, 8)}...` // Safe partial key for debugging
    });

    // Configure with user's profile_id as app_user_id
    await Purchases.configure({
      apiKey: apiKey,
      appUserID: userId  // profile_id becomes app_user_id in RevenueCat
    });

    // Enable debug logging in development
    if (__DEV__) {
      Purchases.setLogLevel(Purchases.LOG_LEVEL.DEBUG);
      logDiagnostic('debug_logging_enabled', {
        development_mode: true,
        log_level: 'DEBUG'
      });
    }

    isConfigured = true;
    currentUserId = userId;
    
    // DIAGNOSTIC: Successful initialization with complete state
    logDiagnostic('initialization_success', {
      user_id: userId,
      platform: Platform.OS,
      duration_ms: Date.now() - initStartTime,
      is_configured: isConfigured,
      current_user_set: !!currentUserId,
      sdk_debug_enabled: __DEV__
    });
    
    console.log('RevenueCat initialized successfully');
    return true;
    
  } catch (error) {
    console.error('Failed to initialize RevenueCat:', error);
    
    // DIAGNOSTIC: Complete error context for initialization failures
    logDiagnostic('initialization_failed', {
      failure_reason: 'sdk_error',
      error_message: error.message,
      error_code: error.code,
      error_name: error.name,
      user_id: userId,
      platform: Platform.OS,
      duration_ms: Date.now() - initStartTime,
      is_configured: isConfigured,
      stack_trace: error.stack ? error.stack.substring(0, 500) : null
    });
    
    isConfigured = false;
    return false;
  }
}

/**
 * Check if purchases are properly initialized
 * ENHANCED with state tracking for button enablement diagnosis
 * 
 * @returns {boolean} Initialization status
 */
export function isPurchasesReady() {
  const readyState = isConfigured;
  const checkTime = Date.now();
  
  // DIAGNOSTIC: Track every ready check - this is the critical function for button state
  logDiagnostic('ready_check', {
    is_configured: isConfigured,
    current_user_id: currentUserId,
    ready_result: readyState,
    check_timestamp: checkTime,
    // Include internal state for debugging
    internal_state: {
      configured: isConfigured,
      user_set: !!currentUserId
    }
  });
  
  return readyState;
}

/**
 * Get available offerings and packages from RevenueCat
 * ENHANCED with complete response capture for product availability diagnosis
 * 
 * @returns {Promise<Object>} Available offerings with packages
 */
export async function getOfferings() {
  const fetchStartTime = Date.now();
  
  try {
    if (!isConfigured) {
      // DIAGNOSTIC: Offerings called before initialization
      logDiagnostic('offerings_failed', {
        failure_reason: 'not_initialized',
        is_configured: isConfigured,
        current_user_id: currentUserId
      });
      
      throw new Error('RevenueCat not configured. Call initializePurchases first.');
    }

    // DIAGNOSTIC: Track offerings fetch attempt
    logDiagnostic('offerings_fetch_start', {
      is_configured: isConfigured,
      current_user_id: currentUserId,
      fetch_start_time: fetchStartTime
    });

    const offerings = await Purchases.getOfferings();
    
    // DIAGNOSTIC: Complete offerings response capture for product analysis
    logDiagnostic('offerings_success', {
      duration_ms: Date.now() - fetchStartTime,
      raw_offerings: JSON.stringify(offerings), // Complete response for debugging
      offerings_count: Object.keys(offerings.all || {}).length,
      current_offering_id: offerings.current?.identifier,
      current_packages_count: offerings.current?.availablePackages?.length || 0,
      all_offering_keys: JSON.stringify(Object.keys(offerings.all || {})),
      // Product availability analysis
      target_product_available: offerings.current?.availablePackages?.some(
        pkg => pkg.product.identifier === PRODUCT_IDS[Platform.OS]
      ) || false
    });
    
    console.log('Retrieved offerings:', offerings);
    return offerings;
    
  } catch (error) {
    console.error('Failed to get offerings:', error);
    
    // DIAGNOSTIC: Offerings failure analysis
    logDiagnostic('offerings_failed', {
      failure_reason: 'fetch_error',
      error_message: error.message,
      error_code: error.code,
      error_name: error.name,
      duration_ms: Date.now() - fetchStartTime,
      is_configured: isConfigured,
      current_user_id: currentUserId,
      stack_trace: error.stack ? error.stack.substring(0, 500) : null
    });
    
    throw mapToPublicError(error);
  }
}

/**
 * Purchase premium insights subscription using RevenueCat
 * ENHANCED with complete purchase flow tracking
 * 
 * @returns {Promise<Object>} Purchase result
 */
export async function purchasePremiumInsights() {
  const purchaseStartTime = Date.now();
  
  try {
    if (!isConfigured) {
      // DIAGNOSTIC: Purchase attempted before initialization
      logDiagnostic('purchase_failed', {
        failure_reason: 'not_initialized',
        is_configured: isConfigured,
        current_user_id: currentUserId
      });
      
      throw new Error('RevenueCat not configured. Call initializePurchases first.');
    }

    console.log('Starting purchase flow for product_a');

    // DIAGNOSTIC: Purchase flow initiation
    logDiagnostic('purchase_attempt', {
      target_product_id: PRODUCT_IDS[Platform.OS],
      platform: Platform.OS,
      is_configured: isConfigured,
      current_user_id: currentUserId,
      purchase_start_time: purchaseStartTime
    });

    // Get offerings to find the package for product_a
    const offerings = await Purchases.getOfferings();
    
    // DIAGNOSTIC: Offerings retrieved for purchase
    logDiagnostic('purchase_offerings_retrieved', {
      offerings_available: Object.keys(offerings.all || {}).length > 0,
      current_offering_available: !!offerings.current,
      target_product_id: PRODUCT_IDS[Platform.OS]
    });
    
    // Find the package containing your subscription
    let packageToPurchase = null;
    const availableProducts = [];
    
    // DIAGNOSTIC: Track product search process
    Object.values(offerings.all).forEach(offering => {
      offering.availablePackages.forEach(rcPackage => {
        availableProducts.push({
          offering_id: offering.identifier,
          package_id: rcPackage.identifier,
          product_id: rcPackage.product.identifier
        });
        
        if (rcPackage.product.identifier === PRODUCT_IDS[Platform.OS]) {
          packageToPurchase = rcPackage;
        }
      });
    });

    // DIAGNOSTIC: Product search results
    logDiagnostic('purchase_product_search', {
      target_product_id: PRODUCT_IDS[Platform.OS],
      package_found: !!packageToPurchase,
      available_products: JSON.stringify(availableProducts),
      total_packages_searched: availableProducts.length
    });

    if (!packageToPurchase) {
      // DIAGNOSTIC: Product not found in offerings
      logDiagnostic('purchase_failed', {
        failure_reason: 'product_not_found',
        target_product_id: PRODUCT_IDS[Platform.OS],
        available_products: JSON.stringify(availableProducts),
        duration_ms: Date.now() - purchaseStartTime
      });
      
      throw new Error(`Product not found in offerings: ${PRODUCT_IDS[Platform.OS]}`);
    }

    console.log('Found package to purchase:', packageToPurchase.identifier);

    // DIAGNOSTIC: Package ready for purchase
    logDiagnostic('purchase_package_found', {
      package_identifier: packageToPurchase.identifier,
      product_identifier: packageToPurchase.product.identifier,
      package_type: packageToPurchase.packageType
    });

    // Execute purchase through RevenueCat
    const purchaseResult = await Purchases.purchasePackage(packageToPurchase);
    
    console.log('Purchase completed:', purchaseResult);

    // DIAGNOSTIC: Purchase completion analysis
    const customerInfo = purchaseResult.customerInfo;
    const activeEntitlements = customerInfo.entitlements.active;
    const hasProductA = 'product_a' in activeEntitlements;
    
    logDiagnostic('purchase_success', {
      transaction_id: purchaseResult.transaction?.transactionIdentifier,
      product_id: packageToPurchase.product.identifier,
      package_id: packageToPurchase.identifier,
      duration_ms: Date.now() - purchaseStartTime,
      entitlement_active_immediately: hasProductA,
      active_entitlements: JSON.stringify(Object.keys(activeEntitlements))
    });
    
    if (!hasProductA) {
      // DIAGNOSTIC: Entitlement timing issue
      logDiagnostic('purchase_entitlement_delay', {
        purchase_successful: true,
        product_a_entitled: hasProductA,
        active_entitlements: JSON.stringify(Object.keys(activeEntitlements))
      });
      
      console.warn('Purchase completed but entitlement not immediately active');
    }

    // Return success in format compatible with your existing code
    return {
      success: true,
      productId: packageToPurchase.product.identifier,
      transactionId: purchaseResult.transaction?.transactionIdentifier,
      customerInfo: customerInfo
    };
    
  } catch (error) {
    console.error('Purchase error:', error);
    
    // DIAGNOSTIC: Purchase failure analysis
    logDiagnostic('purchase_failed', {
      failure_reason: 'execution_error',
      error_message: error.message,
      error_code: error.code,
      error_name: error.name,
      duration_ms: Date.now() - purchaseStartTime,
      stack_trace: error.stack ? error.stack.substring(0, 500) : null
    });
    
    // Transform RevenueCat errors to your existing interface
    const publicError = mapToPublicError(error);
    
    // Handle user cancellation
    if (publicError.code === PURCHASE_ERROR_TYPES.CANCELLED) {
      logDiagnostic('purchase_cancelled', {
        cancellation_reason: 'user_cancelled',
        duration_ms: Date.now() - purchaseStartTime
      });
      
      return { cancelled: true };
    }
    
    // Return error in your existing format
    return { error: publicError };
  }
}

/**
 * Restore previous purchases
 * ENHANCED with restoration tracking
 */
export async function restorePurchases() {
  const restoreStartTime = Date.now();
  
  try {
    if (!isConfigured) {
      logDiagnostic('restore_failed', {
        failure_reason: 'not_initialized',
        is_configured: isConfigured
      });
      
      throw new Error('RevenueCat not configured. Call initializePurchases first.');
    }

    console.log('Restoring purchases');
    
    logDiagnostic('restore_attempt', {
      is_configured: isConfigured,
      current_user_id: currentUserId,
      restore_start_time: restoreStartTime
    });
    
    // RevenueCat handles the restoration automatically
    const customerInfo = await Purchases.restorePurchases();
    
    // Check if product_a entitlement is active after restoration
    const activeEntitlements = customerInfo.entitlements.active;
    const hasProductA = 'product_a' in activeEntitlements;
    
    logDiagnostic('restore_result', {
      duration_ms: Date.now() - restoreStartTime,
      product_a_restored: hasProductA,
      active_entitlements: JSON.stringify(Object.keys(activeEntitlements)),
      entitlements_count: Object.keys(activeEntitlements).length
    });
    
    if (hasProductA) {
      const entitlement = activeEntitlements.product_a;
      return {
        restored: true,
        expires_at: entitlement.expirationDate
      };
    } else {
      return {
        restored: false,
        message: 'No active subscriptions found'
      };
    }
    
  } catch (error) {
    console.error('Restore error:', error);
    
    logDiagnostic('restore_failed', {
      failure_reason: 'execution_error',
      error_message: error.message,
      error_code: error.code,
      duration_ms: Date.now() - restoreStartTime
    });
    
    const publicError = mapToPublicError(error);
    return {
      restored: false,
      error: publicError
    };
  }
}

/**
 * Get current customer info and entitlements
 * ENHANCED with customer state tracking
 */
export async function getCustomerInfo() {
  try {
    if (!isConfigured) {
      logDiagnostic('customer_info_failed', {
        failure_reason: 'not_initialized',
        is_configured: isConfigured
      });
      
      throw new Error('RevenueCat not configured. Call initializePurchases first.');
    }

    const customerInfo = await Purchases.getCustomerInfo();
    
    logDiagnostic('customer_info_retrieved', {
      active_entitlements: JSON.stringify(Object.keys(customerInfo.entitlements.active || {})),
      product_a_active: 'product_a' in (customerInfo.entitlements.active || {}),
      current_user_id: currentUserId
    });
    
    return customerInfo;
    
  } catch (error) {
    console.error('Error getting customer info:', error);
    
    logDiagnostic('customer_info_failed', {
      failure_reason: 'fetch_error',
      error_message: error.message,
      error_code: error.code
    });
    
    throw mapToPublicError(error);
  }
}

/**
 * Clean up RevenueCat listeners
 */
export function cleanupPurchases() {
  logDiagnostic('cleanup_called', {
    is_configured: isConfigured,
    current_user_id: currentUserId
  });
  
  console.log('Purchases cleanup called');
}

/**
 * Map RevenueCat errors to your existing public error structure
 */
function mapToPublicError(error) {
  const publicError = {
    code: PURCHASE_ERROR_TYPES.UNKNOWN,
    message: 'An unknown error occurred'
  };

  // Map RevenueCat error codes to your existing structure
  if (error.code) {
    switch (error.code) {
      case 'USER_CANCELLED':
        publicError.code = PURCHASE_ERROR_TYPES.CANCELLED;
        publicError.message = 'Purchase was cancelled';
        break;
        
      case 'ITEM_ALREADY_OWNED':
        publicError.code = PURCHASE_ERROR_TYPES.ALREADY_OWNED;
        publicError.message = 'You already own this item';
        break;
        
      case 'STORE_PROBLEM':
        publicError.code = PURCHASE_ERROR_TYPES.CONNECTION;
        publicError.message = 'Store connection failed';
        break;
        
      case 'INVALID_PURCHASE':
        publicError.code = PURCHASE_ERROR_TYPES.SERVER;
        publicError.message = 'Purchase validation failed';
        break;
        
      default:
        publicError.message = error.message || 'Purchase failed';
    }
  } else if (error.message) {
    if (error.message.includes('network') || error.message.includes('connection')) {
      publicError.code = PURCHASE_ERROR_TYPES.CONNECTION;
      publicError.message = 'Network connection failed';
    } else {
      publicError.message = error.message;
    }
  }

  return publicError;
}

// Export the same interface your existing code expects
export default {
  initializePurchases,
  cleanupPurchases,
  getOfferings,
  purchasePremiumInsights,
  restorePurchases,
  getCustomerInfo,
  isPurchasesReady,
  PURCHASE_ERROR_TYPES
};