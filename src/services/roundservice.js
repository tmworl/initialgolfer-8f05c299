// src/services/roundservice.js

import { supabase } from "./supabase";

// Track events for analytics (assuming this exists in your app)
// If you have a different analytics service, adjust accordingly
const trackEvent = (eventName, eventData) => {
  // This should be replaced with your actual analytics tracking implementation
  console.log('Analytics Event:', eventName, eventData);
};

// Define event constants for analytics tracking
const EVENTS = {
  ROUND_ABANDONED: 'round_abandoned',
};

/**
 * Create a new round record in Supabase.
 * 
 * @param {string} profile_id - The current user's profile ID.
 * @param {string} course_id - The ID of the course.
 * @param {string} tee_id - The ID of the selected tee.
 * @param {string} tee_name - The name of the selected tee.
 * @returns {object} The newly created round record.
 */
export const createRound = async (profile_id, course_id, tee_id, tee_name) => {
  console.log("[createRound] Attempting to create a new round", { 
    profile_id, 
    course_id,
    tee_id,
    tee_name
  });
  
  // Insert a new round record into the rounds table
  const { data, error } = await supabase
    .from("rounds")
    .insert({
      profile_id,
      course_id,
      is_complete: false, // New round is not complete
      selected_tee_id: tee_id,
      selected_tee_name: tee_name
    })
    .select(); // Returns the inserted record(s)

  if (error) {
    console.error("[createRound] Error creating round:", error);
    throw error;
  }

  console.log("[createRound] Round created successfully:", data[0]);
  return data[0]; // Return the newly created round record
};

/**
 * Delete an abandoned (incomplete) round
 * 
 * This function deletes rounds that were started but not completed,
 * typically called when a user exits the tracker screen without finishing.
 * 
 * @param {string} round_id - The ID of the round to delete
 * @returns {Promise<boolean>} - Success flag
 */
export const deleteAbandonedRound = async (round_id) => {
  const startTime = Date.now();
  
  try {
    console.log("[deleteAbandonedRound] Attempting to delete round:", round_id);
    
    const { error } = await supabase
      .from("rounds")
      .delete()
      .eq("id", round_id)
      .eq("is_complete", false); // Only delete incomplete rounds for safety
    
    const duration = Date.now() - startTime;

    if (error) {
      console.error("[deleteAbandonedRound] Error deleting round:", error);
      trackEvent(EVENTS.ROUND_ABANDONED, {
        success: false,
        error_code: error.code,
        error_message: error.message,
        round_id,
        operation_duration_ms: duration
      });
      return false;
    }
    
    console.log("[deleteAbandonedRound] Round deleted successfully:", round_id);
    trackEvent(EVENTS.ROUND_ABANDONED, {
      success: true,
      round_id,
      operation_duration_ms: duration
    });
    
    return true;
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error("[deleteAbandonedRound] Exception deleting round:", error);
    trackEvent(EVENTS.ROUND_ABANDONED, {
      success: false,
      error_code: 'EXCEPTION',
      error_message: error.message,
      round_id,
      operation_duration_ms: duration
    });
    return false;
  }
};

/**
 * Save hole data for a specific hole to AsyncStorage
 * MODIFIED: Now saves to AsyncStorage instead of database during tracking
 * 
 * This function saves hole data including shots in the new
 * hole-centric format to AsyncStorage for later batch submission.
 * 
 * @param {string} round_id - The ID of the round
 * @param {number} hole_number - The hole number (1-18)
 * @param {object} hole_data - The hole data including par, distance, and shots
 * @param {number} total_score - The total number of shots for this hole
 * @returns {object} The saved record (simulated for compatibility)
 */
export const saveHoleData = async (round_id, hole_number, hole_data, total_score) => {
  console.log("[saveHoleData] Saving data to AsyncStorage for hole", hole_number, "in round", round_id);
  
  try {
    // This function is now called by TrackerScreen but redirected to AsyncStorage
    // The actual database saving happens in completeRound
    const holeRecord = {
      round_id,
      hole_number,
      hole_data,
      total_score,
      saved_at: new Date().toISOString()
    };
    
    console.log("[saveHoleData] Hole data prepared for local storage:", holeRecord);
    return holeRecord; // Return simulated record for compatibility
  } catch (error) {
    console.error("[saveHoleData] Exception in saveHoleData:", error);
    throw error;
  }
};

/**
 * Get all hole data for a round
 * 
 * @param {string} round_id - The ID of the round
 * @returns {Array} Array of hole data records
 */
export const getRoundHoleData = async (round_id) => {
  console.log("[getRoundHoleData] Getting hole data for round", round_id);
  
  try {
    const { data, error } = await supabase
      .from("shots")
      .select("*")
      .eq("round_id", round_id)
      .order("hole_number", { ascending: true });
    
    if (error) {
      console.error("[getRoundHoleData] Error getting hole data:", error);
      throw error;
    }
    
    console.log("[getRoundHoleData] Found hole data:", data?.length, "holes");
    return data || [];
  } catch (error) {
    console.error("[getRoundHoleData] Exception in getRoundHoleData:", error);
    return [];
  }
};

/**
 * Complete a round by updating its is_complete flag and calculating final statistics.
 * ENHANCED: Now accepts hole data parameter and handles all database operations
 * Enhanced with granular error handling and retry support
 * 
 * @param {string} round_id - The ID of the round to complete.
 * @param {object} storedHoleData - All hole data from AsyncStorage
 * @param {number} totalHoles - Total number of holes in the round
 * @returns {object} The updated round record.
 */
export const completeRound = async (round_id, storedHoleData, totalHoles = 18) => {
  try {
    console.log("[completeRound] Starting round completion process for round:", round_id);
    console.log("[completeRound] Processing", Object.keys(storedHoleData).length, "holes of data");
    
    // 1. Get the course_id from the round
    let roundData, courseData;
    try {
      const { data: roundResult, error: roundError } = await supabase
        .from("rounds")
        .select("course_id, profile_id, selected_tee_name") 
        .eq("id", round_id)
        .single();
        
      if (roundError) {
        throw new Error(`Failed to fetch round data: ${roundError.message}`);
      }
      
      roundData = roundResult;
      console.log("[completeRound] Round data retrieved successfully");
    } catch (error) {
      console.error("[completeRound] Error fetching round data:", error);
      throw new Error(`Failed to fetch round information: ${error.message}`);
    }
    
    // 2. Get the par value for that course
    try {
      const { data: courseResult, error: courseError } = await supabase
        .from("courses")
        .select("par")
        .eq("id", roundData.course_id)
        .single();
        
      if (courseError) {
        throw new Error(`Failed to fetch course data: ${courseError.message}`);
      }
      
      courseData = courseResult;
      console.log("[completeRound] Course data retrieved successfully");
    } catch (error) {
      console.error("[completeRound] Error fetching course data:", error);
      throw new Error(`Failed to fetch course information: ${error.message}`);
    }
    
    const coursePar = courseData.par || 72; // Default to 72 if par is not set
    
    // 3. Save each hole to the database with granular error handling
    let grossShots = 0;
    let holesProcessed = 0;
    
    for (let holeNum = 1; holeNum <= totalHoles; holeNum++) {
      // Skip holes with no data
      if (!storedHoleData[holeNum] || !storedHoleData[holeNum].shots || storedHoleData[holeNum].shots.length === 0) {
        console.log(`[completeRound] Skipping hole ${holeNum} - no shot data`);
        continue;
      }
      
      const holeInfo = storedHoleData[holeNum];
      const totalScore = holeInfo.shots.length;
      
      // Create hole data object including POI data
      const holeDataForDb = {
        par: holeInfo.par,
        distance: holeInfo.distance,
        index: holeInfo.index,
        features: holeInfo.features,
        shots: holeInfo.shots,
        poi: holeInfo.poi // Include POI data in database record
      };
      
      // Save hole data to database with specific error handling
      try {
        const { data, error } = await supabase
          .from("shots")
          .upsert({
            round_id,
            hole_number: holeNum,
            hole_data: holeDataForDb,
            total_score: totalScore
          }, {
            onConflict: 'round_id,hole_number',
            returning: 'representation'
          });
        
        if (error) {
          throw new Error(`Failed to save hole ${holeNum} data: ${error.message}`);
        }
        
        grossShots += totalScore;
        holesProcessed++;
        console.log(`[completeRound] Hole ${holeNum} data saved to database (${totalScore} shots)`);
      } catch (error) {
        console.error(`[completeRound] Error saving hole ${holeNum}:`, error);
        throw new Error(`Failed to save data for hole ${holeNum}: ${error.message}`);
      }
    }
    
    console.log(`[completeRound] Successfully processed ${holesProcessed} holes with ${grossShots} total shots`);
    
    // 4. Calculate score relative to par
    const score = grossShots - coursePar;
    
    console.log("[completeRound] Statistics calculated:", {
      coursePar,
      grossShots,
      score,
      holesProcessed
    });
    
    // 5. Update the round record with calculated values and mark as complete
    let finalRoundData;
    try {
      const { data, error } = await supabase
        .from("rounds")
        .update({ 
          is_complete: true,
          gross_shots: grossShots,
          score: score
        })
        .eq("id", round_id)
        .select();

      if (error) {
        throw new Error(`Failed to complete round: ${error.message}`);
      }
      
      finalRoundData = data;
      console.log("[completeRound] Round marked as complete successfully");
    } catch (error) {
      console.error("[completeRound] Error completing round:", error);
      throw new Error(`Failed to finalize round: ${error.message}`);
    }
    
    // 6. Trigger insights generation (non-blocking)
    try {
      console.log("[completeRound] Triggering insights generation Edge Function");
      
      supabase.functions.invoke('analyze-golf-performance', {
        body: { 
          userId: roundData.profile_id,
          roundId: round_id
        }
      }).then(({ data: insightsData, error: insightsError }) => {
        if (insightsError) {
          console.error("[completeRound] Error from insights Edge Function:", insightsError);
        } else {
          console.log("[completeRound] Insights generated successfully:", insightsData);
        }
      }).catch(err => {
        console.error("[completeRound] Exception calling insights Edge Function:", err);
      });
      
    } catch (insightsError) {
      console.error("[completeRound] Failed to trigger insights generation:", insightsError);
      // Don't throw here - insights generation is non-critical
    }

    console.log("[completeRound] Round completion process finished successfully");
    return finalRoundData;
  } catch (error) {
    console.error("[completeRound] Error in complete round process:", error);
    throw error; // Re-throw with original error message for user display
  }
};