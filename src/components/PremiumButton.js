// src/components/PremiumButton.js
//
// Strategic purchase flow entry point component
// ENHANCED with comprehensive button state diagnostics for purchase enablement issues

import React, { useState, useEffect } from 'react';
import { Alert } from 'react-native';
import Button from '../ui/components/Button';
import purchaseService, { PURCHASE_ERROR_TYPES } from '../services/purchaseService';
import { useNavigation } from '@react-navigation/native';
import { usePostHog } from 'posthog-react-native';

/**
 * PremiumButton Component
 * 
 * ENHANCED with comprehensive diagnostics for button enablement issues.
 * Tracks every state change, user interaction, and purchase flow step
 * to diagnose why isPurchasesReady() returns false.
 * 
 * @param {Object} props Component props
 * @param {string} props.label Text to display on button
 * @param {string} props.productId Product identifier
 * @param {Function} props.onPurchaseComplete Callback after successful purchase
 * @param {Function} props.onPurchaseFailed Callback after failed purchase
 * @param {string} props.variant Button visual variant
 * @param {Object} props.style Additional styles to apply
 */
const PremiumButton = ({
  label = "Upgrade to Premium",
  productId = null,
  onPurchaseComplete = () => {},
  onPurchaseFailed = () => {},
  variant = "primary",
  style,
  ...otherProps
}) => {
  const [loading, setLoading] = useState(false);
  const navigation = useNavigation();
  const posthog = usePostHog();

  // DIAGNOSTIC: Track PostHog availability for component analytics
  useEffect(() => {
    posthog?.capture('premium_button_component_mounted', {
      posthog_available: !!posthog,
      button_label: label,
      product_id: productId,
      component: 'PremiumButton',
      mount_timestamp: Date.now()
    });
  }, [posthog, label, productId]);

  // DIAGNOSTIC: Track button state on every render
  // This is critical for understanding why the button is disabled
  const isPurchasesReady = purchaseService.isPurchasesReady();
  const isButtonDisabled = loading || !isPurchasesReady;

  useEffect(() => {
    // DIAGNOSTIC: Capture every button state change
    posthog?.capture('premium_button_state_change', {
      is_purchases_ready: isPurchasesReady,
      is_button_disabled: isButtonDisabled,
      button_loading: loading,
      button_label: label,
      product_id: productId,
      disable_reason: !isPurchasesReady ? 'purchases_not_ready' : loading ? 'loading' : 'enabled',
      state_timestamp: Date.now(),
      component: 'PremiumButton'
    });

    // DIAGNOSTIC: If button is disabled due to purchases not ready, get detailed state
    if (!isPurchasesReady) {
      posthog?.capture('premium_button_disabled_detailed_state', {
        purchases_ready: isPurchasesReady,
        button_disabled: isButtonDisabled,
        loading_state: loading,
        disable_timestamp: Date.now(),
        // This event specifically tracks when the button is disabled due to RevenueCat
        primary_issue: 'isPurchasesReady_returned_false'
      });
    }
  }, [isPurchasesReady, isButtonDisabled, loading, label, productId, posthog]);

  /**
   * Handle purchase initiation with comprehensive interaction tracking
   */
  const handlePurchase = async () => {
    const interactionStartTime = Date.now();
    
    // DIAGNOSTIC: Track every button press attempt
    posthog?.capture('premium_button_pressed', {
      button_label: label,
      product_id: productId,
      button_disabled_state: isButtonDisabled,
      purchases_ready_state: isPurchasesReady,
      interaction_start_time: interactionStartTime,
      user_action: 'button_press'
    });

    // Pre-flight check: Ensure RevenueCat is initialized
    if (!isPurchasesReady) {
      // DIAGNOSTIC: Critical - user pressed disabled button
      posthog?.capture('premium_button_disabled_interaction', {
        is_purchases_ready: isPurchasesReady,
        button_disabled: isButtonDisabled,
        user_attempted_disabled_button: true,
        interaction_context: 'user_pressed_disabled_button',
        error_condition: 'isPurchasesReady_false_on_press'
      });
      
      Alert.alert(
        "Service Unavailable",
        "Purchase service is initializing. Please try again in a moment.",
        [{ text: "OK" }]
      );
      return;
    }
    
    try {
      setLoading(true);
      
      // DIAGNOSTIC: Track purchase flow initiation
      posthog?.capture('premium_purchase_flow_started', {
        product_id: productId,
        button_label: label,
        user_interaction_context: 'button_press',
        flow_start_time: Date.now(),
        purchases_ready_confirmed: isPurchasesReady
      });
      
      // Initiate purchase via RevenueCat service layer
      const result = await purchaseService.purchasePremiumInsights();
      
      setLoading(false);
      
      // Handle cancellation - silent failure maintains existing UX
      if (result.cancelled) {
        // DIAGNOSTIC: User cancelled purchase
        posthog?.capture('premium_purchase_user_cancelled', {
          product_id: productId,
          cancellation_context: 'user_cancelled_in_modal',
          interaction_duration_ms: Date.now() - interactionStartTime,
          flow_stage: 'apple_modal_cancellation'
        });
        return;
      }
      
      // Handle errors with contextual messaging
      if (result.error) {
        const errorMessage = getErrorMessage(result.error);
        
        // DIAGNOSTIC: Purchase error with user-facing context
        posthog?.capture('premium_purchase_user_error', {
          error_code: result.error.code,
          error_message: result.error.message,
          user_facing_message: errorMessage,
          product_id: productId,
          interaction_duration_ms: Date.now() - interactionStartTime,
          flow_stage: 'purchase_execution_error'
        });
        
        Alert.alert("Purchase Failed", errorMessage, [{ text: "OK" }]);
        onPurchaseFailed(result.error);
        return;
      }
      
      // Purchase successful - notify parent and track completion
      posthog?.capture('premium_purchase_completed_successfully', {
        transaction_id: result.transactionId,
        product_id: result.productId,
        button_label: label,
        interaction_duration_ms: Date.now() - interactionStartTime,
        flow_stage: 'purchase_completion_success'
      });
      
      Alert.alert(
        "Purchase Successful",
        "Premium features are now available! Enjoy advanced insights and analysis.",
        [{ text: "Great!" }]
      );
      
      onPurchaseComplete(result);
      
    } catch (error) {
      setLoading(false);
      console.error("Purchase flow error:", error);
      
      // DIAGNOSTIC: Unexpected component-level errors
      posthog?.capture('premium_purchase_flow_exception', {
        error_message: error.message,
        error_name: error.name,
        error_stack: error.stack ? error.stack.substring(0, 300) : null,
        product_id: productId,
        interaction_duration_ms: Date.now() - interactionStartTime,
        flow_stage: 'component_exception',
        exception_context: 'unexpected_component_error'
      });
      
      Alert.alert(
        "Purchase Error",
        "An unexpected error occurred. Please try again later.",
        [{ text: "OK" }]
      );
      
      onPurchaseFailed({ code: PURCHASE_ERROR_TYPES.UNKNOWN, message: error.message });
    }
  };
  
  /**
   * Map error codes to user-friendly messages with diagnostic tracking
   */
  const getErrorMessage = (error) => {
    // DIAGNOSTIC: Track error message mapping for UX insights
    posthog?.capture('premium_error_message_mapped', {
      original_error_code: error.code,
      original_error_message: error.message,
      mapping_context: 'user_facing_message_generation'
    });
    
    switch (error.code) {
      case PURCHASE_ERROR_TYPES.CONNECTION:
        return "Network connection failed. Please check your connection and try again.";
        
      case PURCHASE_ERROR_TYPES.ALREADY_OWNED:
        return "You already own this item. Try restoring your purchases in the Profile screen.";
        
      case PURCHASE_ERROR_TYPES.NOT_ALLOWED:
        return "Purchase not allowed. Your account may have restrictions.";
        
      case PURCHASE_ERROR_TYPES.SERVER:
        return "Server validation failed. Please try again later.";
        
      default:
        return error.message || "An unknown error occurred. Please try again later.";
    }
  };
  
  // DIAGNOSTIC: Track button render with current state
  // This helps correlate button visibility with user behavior
  useEffect(() => {
    posthog?.capture('premium_button_rendered', {
      is_purchases_ready: isPurchasesReady,
      is_button_disabled: isButtonDisabled,
      button_loading: loading,
      button_label: label,
      product_id: productId,
      render_timestamp: Date.now(),
      render_context: 'component_render_cycle'
    });
  }, []); // Only on mount to avoid excessive events
  
  return (
    <Button
      variant={variant}
      onPress={handlePurchase}
      loading={loading}
      disabled={isButtonDisabled}
      iconRight={loading ? undefined : "arrow-forward"}
      style={style}
      {...otherProps}
    >
      {label}
    </Button>
  );
};

export default PremiumButton;