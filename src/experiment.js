/**
 * @title Video Viewing Study
 * @description Video viewing and emotion regulation study
 * @version 3.3.2
 *
 * @assets assets/
 */

import "../styles/main.scss";

import HtmlKeyboardResponsePlugin from "@jspsych/plugin-html-keyboard-response";
import HtmlButtonResponsePlugin from "@jspsych/plugin-html-button-response";
import VideoKeyboardResponsePlugin from "@jspsych/plugin-video-keyboard-response";
import SurveyLikertPlugin from "@jspsych/plugin-survey-likert";
import SurveyTextPlugin from "@jspsych/plugin-survey-text";
import PreloadPlugin from "@jspsych/plugin-preload";
import FullscreenPlugin from "@jspsych/plugin-fullscreen";
import { initJsPsych } from "jspsych";

// Import custom video arousal rating plugin
import VideoArousalRatingPlugin from "./plugins/plugin-video-arousal-rating.js";
import VideoDialRatingPlugin from "./plugins/plugin-video-dial-rating.js";

export async function run({
  assetPaths,
  input = {},
  environment,
  title,
  version,
}) {
  // === Progress Monitor Setup (opt-in via ?monitor= URL param) ===
  let monitorUrl;
  if (typeof jatos !== "undefined" && jatos.urlQueryParameters) {
    // Running in JATOS - use jatos.urlQueryParameters
    monitorUrl = jatos.urlQueryParameters.monitor;
    console.log("JATOS monitor URL from urlQueryParameters:", monitorUrl);
  } else {
    // Running standalone - use window.location.search
    monitorUrl = new URLSearchParams(window.location.search).get("monitor");
    console.log("Standalone monitor URL from window.location.search:", monitorUrl);
  }

  // Hardcoded fallback to production monitor server
  if (!monitorUrl) {
    monitorUrl = "wss://swaglab.ucsd.edu/monitor";
    console.log("Using hardcoded monitor URL:", monitorUrl);
  } else {
    console.log("Attempting to connect to monitor:", monitorUrl);
  }

  let monitorSocket = null;

  if (monitorUrl) {
    try {
      monitorSocket = new WebSocket(monitorUrl);
      monitorSocket.onopen = () =>
        console.log("Monitor connected:", monitorUrl);
      monitorSocket.onerror = () => {
        console.warn(
          "Monitor connection failed, continuing without monitoring",
        );
        monitorSocket = null;
      };
      monitorSocket.onclose = () => {
        monitorSocket = null;
      };
    } catch (e) {
      console.warn("Monitor connection failed:", e.message);
      monitorSocket = null;
    }
  }

  // Helper to safely send monitor updates (no-ops if not connected)
  function sendMonitorUpdate(data) {
    if (monitorSocket && monitorSocket.readyState === WebSocket.OPEN) {
      monitorSocket.send(JSON.stringify({ ...data, timestamp: Date.now() }));
    }
  }

  // Expose for dial plugin to use
  window.__experimentMonitor = { sendMonitorUpdate };

  const jsPsych = initJsPsych({
    on_finish: function () {
      sendMonitorUpdate({ type: "session_end" });
      const resultData = jsPsych.data.get().json();
      // Check if JATOS is available
      if (typeof jatos !== "undefined") {
        jatos.endStudy(resultData);
      } else {
        // Fallback: log data to console when not running in JATOS
        console.log("Experiment complete. Data:", resultData);
      }
    },
    on_data_update: function (data) {
      // Save data incrementally to JATOS after each trial
      if (typeof jatos !== "undefined" && jatos.submitResultData) {
        jatos.submitResultData(data);
      }
    },
  });

  // Set up monitor message handler for pause/resume/continue commands
  if (monitorSocket) {
    monitorSocket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === "control_command") {
          if (message.action === "pause_session") {
            // Session pause - pauses after current trial completes (jsPsych level)
            console.log("Monitor: Pausing session (after current trial)");
            jsPsych.pauseExperiment();
            sendMonitorUpdate({ type: "status_update", status: "session_paused" });
          } else if (message.action === "resume_session") {
            // Resume session
            console.log("Monitor: Resuming session");
            jsPsych.resumeExperiment();
            sendMonitorUpdate({ type: "status_update", status: "session_resumed" });
          } else if (message.action === "pause_video") {
            // Video pause - immediately pauses the video with overlay
            console.log("Monitor: Pausing video");
            if (window.__videoDialPlugin) {
              window.__videoDialPlugin.pauseVideo();
            }
            sendMonitorUpdate({ type: "status_update", status: "video_paused" });
          } else if (message.action === "resume_video") {
            // Resume video
            console.log("Monitor: Resuming video");
            if (window.__videoDialPlugin) {
              window.__videoDialPlugin.resumeVideo();
            }
            sendMonitorUpdate({ type: "status_update", status: "video_resumed" });
          } else if (message.action === "continue") {
            // Remote continue - simulate 'n' keypress for RA wait screens
            console.log("Monitor: Remote continue triggered");
            jsPsych.pluginAPI.keyDown("n");
            jsPsych.pluginAPI.keyUp("n");
            sendMonitorUpdate({ type: "status_update", status: "continued" });
          }
        }
      } catch (e) {
        console.warn("Monitor message parse error:", e);
      }
    };
  }

  // Global click handler - uses jsPsych's simulation API
  // This allows the dial button click to work as a universal "proceed" action
  document.addEventListener("mousedown", function (e) {
    if (e.button === 0) {
      // Primary mouse button only
      console.log("Click detected, simulating 'n' keypress via jsPsych");
      // Use jsPsych's built-in key simulation
      jsPsych.pluginAPI.keyDown("n");
      jsPsych.pluginAPI.keyUp("n");
    }
  });

  const timeline = [];

  // Load videos from JSON
  async function loadJSON(filepath) {
    const response = await fetch(filepath);
    const data = await response.json();
    return data;
  }

  var allVideos = await loadJSON("assets/videos.json");

  // Block types
  var blockTypes = ["neutral", "participatory", "observatory"];

  // Shuffle function (Fisher-Yates)
  function shuffle(array) {
    var shuffled = [...array];
    for (var i = shuffled.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var temp = shuffled[i];
      shuffled[i] = shuffled[j];
      shuffled[j] = temp;
    }
    return shuffled;
  }

  // ============================================================
  // THERMOMETER RATING COMPONENT
  // ============================================================
  //
  // Coordinate system (all values in pixels):
  //   SCALE_WIDTH = 480       (distance from 0 to 10)
  //   SCALE_ORIGIN = 90       (x position where 0 is)
  //   TRACK_START = 70        (x position where fill begins)
  //   FILL_BASE = 20          (fill width at value 0)
  //   PIXELS_PER_UNIT = 48    (pixels per scale unit)
  //
  // Position formula for any value V:
  //   X = SCALE_ORIGIN + V * PIXELS_PER_UNIT = 90 + V * 48
  //
  // Fill width formula:
  //   width = FILL_BASE + V * PIXELS_PER_UNIT = 20 + V * 48
  //
  // ============================================================

  var THERM = {
    SCALE_WIDTH: 480,
    SCALE_ORIGIN: 90,
    TRACK_START: 70,
    FILL_BASE: 20,
    PIXELS_PER_UNIT: 48,
  };

  function createThermometerRatingHTML(question, instruction, color) {
    var fillColor = color === "blue" ? "#3498db" : "#c0392b";
    var bulbGradient =
      color === "blue"
        ? "radial-gradient(circle at 30% 30%, #5dade2, #3498db, #2980b9)"
        : "radial-gradient(circle at 30% 30%, #e74c3c, #c0392b, #a93226)";
    var darkColor = color === "blue" ? "#2980b9" : "#a93226";

    // Generate ticks: 21 ticks at positions 0, 24, 48, ... 480
    var ticksHTML = "";
    for (var i = 0; i <= 20; i++) {
      var x = i * 24; // SCALE_WIDTH / 20 = 24
      var isMajor = i % 2 === 0;
      var height = isMajor ? 16 : 10;
      var width = isMajor ? 2 : 1;
      var bgColor = isMajor ? "#333" : "#999";
      ticksHTML +=
        '<div style="position: absolute; left: ' +
        x +
        "px; top: 0; width: " +
        width +
        "px; height: " +
        height +
        "px; background: " +
        bgColor +
        '; transform: translateX(-50%);"></div>';
    }

    // Generate numbers: 11 numbers at positions 0, 48, 96, ... 480
    var numbersHTML = "";
    for (var i = 0; i <= 10; i++) {
      var x = i * 48; // PIXELS_PER_UNIT = 48
      numbersHTML +=
        '<span style="position: absolute; left: ' +
        x +
        'px; transform: translateX(-50%); font-size: 15px; font-weight: 600; color: #444;">' +
        i +
        "</span>";
    }

    // Initial fill width for value 0: 20 + 0*48 = 20px
    var initialFillWidth = THERM.FILL_BASE + 0 * THERM.PIXELS_PER_UNIT;

    return `
      <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 70vh; padding: 40px;">
        <div style="text-align: center; max-width: 800px; margin-bottom: 40px;">
          <p style="font-size: 26px; font-weight: bold; line-height: 1.4; margin-bottom: 20px; color: #222;">
            ${question}
          </p>
          <p style="font-size: 18px; line-height: 1.6; color: #555;">
            ${instruction}
          </p>
        </div>

        <!-- Thermometer: 600px wide container -->
        <div style="position: relative; width: 600px; height: 130px;">

          <!-- Bulb: 80px circle at x=0, displays current value -->
          <div style="position: absolute; left: 0; top: 10px; width: 80px; height: 80px; border-radius: 50%; background: ${bulbGradient}; border: 4px solid ${fillColor}; z-index: 10; box-shadow: inset 0 -5px 15px rgba(0,0,0,0.2);">
            <span id="thermometer-value" style="position: absolute; top: 80%; left: 50%; transform: translate(-50%, -50%); font-size: 32px; font-weight: bold; color: white; text-shadow: 1px 1px 3px rgba(0,0,0,0.5);">0</span>
          </div>

          <!-- Track: gray bar from x=70 to x=580 (510px wide) -->
          <div style="position: absolute; left: 70px; top: 28px; width: 510px; height: 44px; background: linear-gradient(to bottom, #f8f8f8, #e8e8e8); border-radius: 0 22px 22px 0; border: 3px solid #ccc; box-shadow: inset 0 2px 6px rgba(0,0,0,0.1);"></div>

          <!-- Fill: colored bar from x=70, width calculated by formula -->
          <div id="thermometer-fill" style="position: absolute; left: 70px; top: 28px; width: ${initialFillWidth}px; height: 44px; background: linear-gradient(to bottom, ${fillColor}, ${darkColor}); border-radius: 0 22px 22px 0; border: 3px solid ${fillColor}; border-left: none; transition: width 0.1s ease-out; box-sizing: border-box;"></div>

          <!-- Scale: ticks and numbers container at x=90 (where 0 is), width=480 -->
          <div style="position: absolute; left: 90px; top: 52px; width: 480px; height: 50px;">
            <!-- Ticks -->
            <div style="position: absolute; left: 0; right: 0; top: 0; height: 20px;">
              ${ticksHTML}
            </div>
            <!-- Numbers -->
            <div style="position: absolute; left: 0; right: 0; top: 22px; height: 20px;">
              ${numbersHTML}
            </div>
          </div>
        </div>

        <p style="font-size: 16px; color: #888; margin-top: 20px;">
          Turn the dial to adjust your rating, then <strong>click the dial button</strong> to submit.
        </p>
      </div>
    `;
  }

  // Setup dial interaction for thermometer rating
  function setupThermometerDial() {
    var currentValue = 0;
    var fill = document.getElementById("thermometer-fill");
    var valueDisplay = document.getElementById("thermometer-value");

    if (!fill || !valueDisplay) {
      console.error("Thermometer elements not found!");
      return;
    }

    // Update fill width using the formula: width = FILL_BASE + value * PIXELS_PER_UNIT
    function updateThermometer(value) {
      currentValue = Math.max(0, Math.min(10, value));
      currentValue = Math.round(currentValue * 2) / 2; // Round to nearest 0.5

      var fillWidth = THERM.FILL_BASE + currentValue * THERM.PIXELS_PER_UNIT;
      fill.style.width = fillWidth + "px";
      valueDisplay.textContent = currentValue;
      window.__thermometerValue = currentValue;
    }

    // Handle wheel input - optimized for Windows with physical dial
    var handleWheel = function (e) {
      e.preventDefault();
      e.stopPropagation();
      var scrollDirection = e.deltaY > 0 ? 1 : -1;
      updateThermometer(currentValue + scrollDirection * 0.5);
    };

    document.addEventListener("wheel", handleWheel, { passive: false });
    window.addEventListener("wheel", handleWheel, { passive: false });

    // Store cleanup function
    window._thermometerCleanup = function () {
      document.removeEventListener("wheel", handleWheel);
      window.removeEventListener("wheel", handleWheel);
    };

    // Initialize
    window.__thermometerValue = 0;
    updateThermometer(0);
  }

  // Individual rating trials using horizontal thermometer with dial control
  var rating_arousal = {
    type: HtmlKeyboardResponsePlugin,
    stimulus: function () {
      return createThermometerRatingHTML(
        'During the video, how much <span style="color: #c0392b; font-weight: bold;">sexual arousal</span> (i.e., horny/turned on) did you feel?',
        'Use the dial to rate your average level of <span style="color: #c0392b; font-weight: bold;">sexual arousal</span> during the video on a scale from 0 to 10 (10 being the highest).',
        "red",
      );
    },
    choices: ["n", "N"],
    data: { task: "rating", rating_type: "arousal" },
    on_load: setupThermometerDial,
    on_finish: function (data) {
      data.rating = window.__thermometerValue || 5;
      if (window._thermometerCleanup) {
        window._thermometerCleanup();
        delete window._thermometerCleanup;
      }
      sendMonitorUpdate({
        type: "rating_submitted",
        rating_type: "arousal",
        value: data.rating,
        rt: data.rt,
      });
    },
  };

  var rating_pleasure = {
    type: HtmlKeyboardResponsePlugin,
    stimulus: function () {
      return createThermometerRatingHTML(
        'During the video, how much <span style="color: #c0392b; font-weight: bold;">sexual pleasure</span> did you feel?',
        'Use the dial to rate your average level of <span style="color: #c0392b; font-weight: bold;">sexual pleasure</span> during the video on a scale from 0 to 10 (10 being the highest).',
        "red",
      );
    },
    choices: ["n", "N"],
    data: { task: "rating", rating_type: "pleasure" },
    on_load: setupThermometerDial,
    on_finish: function (data) {
      data.rating = window.__thermometerValue || 5;
      if (window._thermometerCleanup) {
        window._thermometerCleanup();
        delete window._thermometerCleanup;
      }
      sendMonitorUpdate({
        type: "rating_submitted",
        rating_type: "pleasure",
        value: data.rating,
        rt: data.rt,
      });
    },
  };

  var rating_distraction = {
    type: HtmlKeyboardResponsePlugin,
    stimulus: function () {
      return createThermometerRatingHTML(
        'During the video, how much <span style="color: #3498db; font-weight: bold;">distraction</span> did you experience?',
        'Use the dial to rate your average <span style="color: #3498db; font-weight: bold;">distraction</span> level during the video on a scale from 0 to 10 (10 being the highest).',
        "blue",
      );
    },
    choices: ["n", "N"],
    data: { task: "rating", rating_type: "distraction" },
    on_load: setupThermometerDial,
    on_finish: function (data) {
      data.rating = window.__thermometerValue || 5;
      if (window._thermometerCleanup) {
        window._thermometerCleanup();
        delete window._thermometerCleanup;
      }
      sendMonitorUpdate({
        type: "rating_submitted",
        rating_type: "distraction",
        value: data.rating,
        rt: data.rt,
      });
    },
  };

  var rating_immersion = {
    type: HtmlKeyboardResponsePlugin,
    stimulus: function () {
      return createThermometerRatingHTML(
        'During the video, how <span style="color: #c0392b; font-weight: bold;">immersed</span> were you in the present moment?',
        'Use the dial to rate your average <span style="color: #c0392b; font-weight: bold;">immersion</span> level during the video on a scale from 0 to 10 (10 being the highest).',
        "red",
      );
    },
    choices: ["n", "N"],
    data: { task: "rating", rating_type: "immersion" },
    on_load: setupThermometerDial,
    on_finish: function (data) {
      data.rating = window.__thermometerValue || 5;
      if (window._thermometerCleanup) {
        window._thermometerCleanup();
        delete window._thermometerCleanup;
      }
      sendMonitorUpdate({
        type: "rating_submitted",
        rating_type: "immersion",
        value: data.rating,
        rt: data.rt,
      });
    },
  };

  // Rating procedure - simple timeline of 4 rating trials
  var rating_procedure = {
    timeline: [
      rating_arousal,
      rating_pleasure,
      rating_distraction,
      rating_immersion,
    ],
  };

  // Randomize videos and block order
  var shuffledVideos = shuffle(allVideos);
  var shuffledBlockTypes = shuffle(blockTypes);

  // Create blocks: each block gets 6 videos
  var blocks = shuffledBlockTypes.map(function (blockType, idx) {
    return {
      blockType: blockType,
      blockOrder: idx + 1,
      videos: shuffledVideos.slice(idx * 6, (idx + 1) * 6),
    };
  });

  console.log("Randomized blocks:", blocks);

  // Preload assets
  var preload = {
    type: PreloadPlugin,
    video: assetPaths.video,
    images: assetPaths.images,
    audio: assetPaths.audio,
  };

  // Variable to store PID
  var entered_pid = "";

  // Helper function to add PID validation (exactly 8 digits)
  function addPidValidation() {
    var form = document.getElementById("jspsych-survey-text-form");
    var input = form.querySelector('input[type="text"]');
    var submitButton = document.getElementById("jspsych-survey-text-next");

    // Hide the Continue button - we use Enter key instead
    submitButton.style.display = "none";

    // Add error message container (hidden initially)
    var errorDiv = document.createElement("div");
    errorDiv.id = "pid-error";
    errorDiv.style.cssText =
      "color: #c0392b; font-size: 16px; margin-top: 10px; display: none; text-align: center;";
    errorDiv.textContent =
      'Please enter exactly 8 digits (without the "A" prefix).';
    submitButton.parentNode.appendChild(errorDiv);

    // Handle Enter key submission with validation
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter") {
        var value = input.value.trim();
        // Remove 'A' prefix if present for validation
        if (value.toLowerCase().startsWith("a")) {
          value = value.substring(1);
        }
        if (!/^\d{8}$/.test(value)) {
          e.preventDefault();
          e.stopImmediatePropagation();
          errorDiv.style.display = "block";
          input.focus();
          return false;
        }
        errorDiv.style.display = "none";
        // Let the form submit naturally via Enter
      }
    });

    // Also intercept button click in case it's somehow triggered
    submitButton.addEventListener("click", function (e) {
      var value = input.value.trim();
      // Remove 'A' prefix if present for validation
      if (value.toLowerCase().startsWith("a")) {
        value = value.substring(1);
      }
      if (!/^\d{8}$/.test(value)) {
        e.preventDefault();
        e.stopImmediatePropagation();
        errorDiv.style.display = "block";
        input.focus();
        return false;
      }
    });
  }

  // PID entry
  var pid_entry = {
    type: SurveyTextPlugin,
    questions: [
      {
        prompt:
          '<p style="font-size: 20px;">Enter your 8-digit Participant ID (without the "A"):</p><p style="font-size: 14px; color: #666;">Example: If your ID is A12345678, enter 12345678</p><p style="font-size: 14px; color: #666; margin-top: 15px;">Press <strong>Enter</strong> to continue.</p>',
        name: "pid",
        required: true,
        placeholder: "12345678",
        rows: 1,
        columns: 20,
      },
    ],
    button_label: "Continue",
    autocomplete: false,
    data: { task: "pid_entry" },
    on_load: addPidValidation,
    on_finish: function (data) {
      // Store PID (remove 'A' prefix if present)
      entered_pid = data.response.pid.trim();
      if (entered_pid.toLowerCase().startsWith("a")) {
        entered_pid = entered_pid.substring(1);
      }
      jsPsych.data.addProperties({
        participant_pid: entered_pid,
      });
      // Send session start to monitor
      sendMonitorUpdate({
        type: "session_start",
        participant_id: entered_pid,
      });
    },
  };

  // PID confirmation - separate page
  var pid_confirmation = {
    type: HtmlKeyboardResponsePlugin,
    stimulus: function () {
      return `
        <div style="text-align: center;">
          <p style="font-size: 20px; margin-bottom: 30px;">Please confirm that this PID is correct: <strong>${entered_pid}</strong></p>
          <p style="font-size: 16px; color: #666;">Press <strong>Enter</strong> to confirm, or <strong>N</strong> to go back and re-enter.</p>
        </div>
      `;
    },
    choices: ["Enter", "n", "N"],
    data: { task: "pid_confirmation" },
  };

  // Blank transition screen
  var pid_transition = {
    type: HtmlKeyboardResponsePlugin,
    stimulus: "",
    choices: "NO_KEYS",
    trial_duration: 100,
    data: { task: "transition" },
  };

  // Loop for PID entry/confirmation with proper separation
  var pid_loop = {
    timeline: [pid_entry, pid_transition, pid_confirmation],
    loop_function: function (data) {
      // Get the confirmation response (last trial in timeline)
      var last_trial = data.values()[data.values().length - 1];
      // If they pressed "N", loop again to re-enter PID
      if (last_trial.response === "n" || last_trial.response === "N") {
        return true; // Loop again - go back to PID entry
      } else {
        return false; // Continue to experiment (Enter was pressed)
      }
    },
  };

  // Welcome screen
  var welcome = {
    type: HtmlKeyboardResponsePlugin,
    stimulus: "<h1 style='font-size: 36px !important;'>Experiment</h1>",
    choices: ["n", "N"],
  };

  // Nature video instructions
  var nature_instructions = {
    type: HtmlKeyboardResponsePlugin,
    stimulus: `
      <div style="display: flex; align-items: center; justify-content: center; padding: 40px;">
        <div style="text-align: center; max-width: 750px;">
          <p style="font-size: 20px; line-height: 1.6;">
            You will now watch a nature video. Take this moment to get comfortable, relax your shoulders, breathe normally, and simply watch the video.
          </p>
          <p style="font-size: 16px; color: #888; margin-top: 30px;">
            Press the <strong>button dial</strong> to continue.
          </p>
        </div>
      </div>
    `,
    choices: ["n", "N"],
    data: { task: "nature_instructions" },
    on_start: function () {
      sendMonitorUpdate({
        type: "trial_update",
        task: "nature_instructions",
        instruction: "Nature Instructions",
      });
    },
    on_finish: function (data) {
      sendMonitorUpdate({
        type: "instruction_complete",
        task: "nature_instructions",
        instruction: "Nature Instructions",
        rt: data.rt,
      });
    },
  };

  // Nature video - auto advances when done, can skip with 'n'
  var nature_video = {
    type: VideoKeyboardResponsePlugin,
    stimulus: ["assets/nature.mp4"],
    choices: ["n", "N"],
    prompt: null,
    width: 1000,
    height: 750,
    autoplay: true,
    trial_ends_after_video: true,
    response_ends_trial: true,
    data: {
      task: "nature_video",
      filename: "nature.mp4",
    },
  };

  // Dial instructions screen - shown at the beginning before nature video
  // Interactive dial for instructions page
  function createInteractiveDialHTML() {
    return `
      <div id="instruction-dial-container" style="position: relative; width: 280px; height: 280px;">
        <svg id="instruction-dial-svg" width="280" height="280" viewBox="0 0 300 300" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <radialGradient id="instrKnobGradient" cx="50%" cy="50%" r="50%" fx="50%" fy="50%">
              <stop offset="0%" style="stop-color:#444;stop-opacity:1" />
              <stop offset="85%" style="stop-color:#111;stop-opacity:1" />
              <stop offset="100%" style="stop-color:#000;stop-opacity:1" />
            </radialGradient>
          </defs>
          <circle cx="150" cy="150" r="145" fill="#050505" stroke="#333" stroke-width="2" />
          <g>
            <!-- Major ticks (integers 0-10) -->
            <line x1="58.1" y1="241.9" x2="68.7" y2="231.3" stroke="white" stroke-width="3" stroke-linecap="round" />
            <line x1="26.4" y1="190.2" x2="40.6" y2="185.5" stroke="white" stroke-width="3" stroke-linecap="round" />
            <line x1="21.6" y1="129.7" x2="36.4" y2="132.0" stroke="white" stroke-width="3" stroke-linecap="round" />
            <line x1="44.8" y1="73.6" x2="57.0" y2="82.4" stroke="white" stroke-width="3" stroke-linecap="round" />
            <line x1="91.0" y1="34.2" x2="97.8" y2="47.5" stroke="white" stroke-width="3" stroke-linecap="round" />
            <line x1="150.0" y1="20.0" x2="150.0" y2="35.0" stroke="white" stroke-width="3" stroke-linecap="round" />
            <line x1="209.0" y1="34.2" x2="202.2" y2="47.5" stroke="white" stroke-width="3" stroke-linecap="round" />
            <line x1="255.2" y1="73.6" x2="243.0" y2="82.4" stroke="white" stroke-width="3" stroke-linecap="round" />
            <line x1="278.4" y1="129.7" x2="263.6" y2="132.0" stroke="white" stroke-width="3" stroke-linecap="round" />
            <line x1="273.6" y1="190.2" x2="259.4" y2="185.5" stroke="white" stroke-width="3" stroke-linecap="round" />
            <line x1="241.9" y1="241.9" x2="231.3" y2="231.3" stroke="white" stroke-width="3" stroke-linecap="round" />
            <!-- Minor ticks (0.5 increments) -->
            <line x1="39.2" y1="217.9" x2="46.0" y2="213.7" stroke="rgba(255,255,255,0.7)" stroke-width="2" stroke-linecap="round" />
            <line x1="20.4" y1="160.2" x2="28.4" y2="159.6" stroke="rgba(255,255,255,0.7)" stroke-width="2" stroke-linecap="round" />
            <line x1="29.9" y1="100.3" x2="37.3" y2="103.3" stroke="rgba(255,255,255,0.7)" stroke-width="2" stroke-linecap="round" />
            <line x1="65.6" y1="51.1" x2="70.8" y2="57.2" stroke="rgba(255,255,255,0.7)" stroke-width="2" stroke-linecap="round" />
            <line x1="119.7" y1="23.6" x2="121.5" y2="31.4" stroke="rgba(255,255,255,0.7)" stroke-width="2" stroke-linecap="round" />
            <line x1="180.3" y1="23.6" x2="178.5" y2="31.4" stroke="rgba(255,255,255,0.7)" stroke-width="2" stroke-linecap="round" />
            <line x1="234.4" y1="51.1" x2="229.2" y2="57.2" stroke="rgba(255,255,255,0.7)" stroke-width="2" stroke-linecap="round" />
            <line x1="270.1" y1="100.3" x2="262.7" y2="103.3" stroke="rgba(255,255,255,0.7)" stroke-width="2" stroke-linecap="round" />
            <line x1="279.6" y1="160.2" x2="271.6" y2="159.6" stroke="rgba(255,255,255,0.7)" stroke-width="2" stroke-linecap="round" />
            <line x1="260.8" y1="217.9" x2="254.0" y2="213.7" stroke="rgba(255,255,255,0.7)" stroke-width="2" stroke-linecap="round" />
          </g>
          <g>
            <text x="82.8" y="217.2" fill="white" font-family="Arial, sans-serif" font-weight="bold" font-size="20" text-anchor="middle" dominant-baseline="middle">0</text>
            <text x="59.6" y="179.4" fill="white" font-family="Arial, sans-serif" font-weight="bold" font-size="20" text-anchor="middle" dominant-baseline="middle">1</text>
            <text x="56.2" y="135.1" fill="white" font-family="Arial, sans-serif" font-weight="bold" font-size="20" text-anchor="middle" dominant-baseline="middle">2</text>
            <text x="73.1" y="94.2" fill="white" font-family="Arial, sans-serif" font-weight="bold" font-size="20" text-anchor="middle" dominant-baseline="middle">3</text>
            <text x="106.9" y="65.4" fill="white" font-family="Arial, sans-serif" font-weight="bold" font-size="20" text-anchor="middle" dominant-baseline="middle">4</text>
            <text x="150.0" y="55.0" fill="white" font-family="Arial, sans-serif" font-weight="bold" font-size="20" text-anchor="middle" dominant-baseline="middle">5</text>
            <text x="193.1" y="65.4" fill="white" font-family="Arial, sans-serif" font-weight="bold" font-size="20" text-anchor="middle" dominant-baseline="middle">6</text>
            <text x="226.9" y="94.2" fill="white" font-family="Arial, sans-serif" font-weight="bold" font-size="20" text-anchor="middle" dominant-baseline="middle">7</text>
            <text x="243.8" y="135.1" fill="white" font-family="Arial, sans-serif" font-weight="bold" font-size="20" text-anchor="middle" dominant-baseline="middle">8</text>
            <text x="240.4" y="179.4" fill="white" font-family="Arial, sans-serif" font-weight="bold" font-size="20" text-anchor="middle" dominant-baseline="middle">9</text>
            <text x="217.2" y="217.2" fill="white" font-family="Arial, sans-serif" font-weight="bold" font-size="20" text-anchor="middle" dominant-baseline="middle">10</text>
          </g>
          <circle cx="150" cy="150" r="75" fill="#222" stroke="#111" stroke-width="1" />
          <circle cx="150" cy="150" r="65" fill="url(#instrKnobGradient)" stroke="#000" stroke-width="2" />
          <circle cx="150" cy="150" r="60" fill="none" stroke="#333" stroke-width="1" opacity="0.5" />
          <g id="instruction-dial-pointer" style="transform-origin: 150px 150px;">
            <line x1="150" y1="130" x2="150" y2="95" stroke="white" stroke-width="4" stroke-linecap="round" />
          </g>
        </svg>
        <p id="dial-value-display" style="font-size: 18px; color: #333; margin-top: 10px; text-align: center; font-weight: bold;">Current Value: 5</p>
      </div>
    `;
  }

  // Dial calibration screen - center the dial before instructions
  var dial_calibration = {
    type: HtmlKeyboardResponsePlugin,
    stimulus: `
      <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 80vh; padding: 40px;">
        <h1 style="font-size: 36px; font-weight: bold; margin-bottom: 30px; color: #2c3e50;">Dial Calibration</h1>
        <p style="font-size: 22px; color: #555; margin-bottom: 40px; text-align: center; max-width: 600px;">
          Turn the dial until the arrow <strong>points straight up</strong>
        </p>

        <!-- Target indicator: solid black circle with white triangle at top -->
        <svg width="200" height="200" viewBox="0 0 200 200">
          <!-- Solid black circle with dark gray outline -->
          <circle cx="100" cy="100" r="80" fill="#000000" stroke="#444444" stroke-width="3"/>
          <!-- White triangle pointer inside at top -->
          <polygon points="100,30 85,55 115,55" fill="#ffffff"/>
        </svg>

        <p style="font-size: 18px; color: #888; margin-top: 40px;">
          When the arrow points up, <strong>click the dial button</strong> to continue
        </p>
      </div>
    `,
    choices: ["n", "N"],
    data: { task: "dial_calibration" },
    on_start: function () {
      sendMonitorUpdate({
        type: "trial_update",
        task: "dial_calibration",
        instruction: "Dial Calibration",
      });
    },
    on_finish: function (data) {
      sendMonitorUpdate({
        type: "instruction_complete",
        task: "dial_calibration",
        instruction: "Dial Calibration",
        rt: data.rt,
      });
    },
  };

  var dial_instructions = {
    type: HtmlKeyboardResponsePlugin,
    stimulus: `
      <div style="display: flex; align-items: center; justify-content: center; padding: 40px;">
        <div style="display: flex; align-items: center; gap: 60px; max-width: 1200px;">
          <div style="flex: 1; text-align: left;">
            <h1 style="font-size: 32px; font-weight: bold; margin-bottom: 20px;">How to Use the Sexual Arousal Dial</h1>

            <p style="font-size: 18px; line-height: 1.6; margin-bottom: 20px; background: #f0f0f0; padding: 15px; border-radius: 8px;">
              <strong>By sexual arousal we mean your awareness of your bodily response to sexual stimuli.</strong>
            </p>

            <p style="font-size: 18px; line-height: 1.6; margin-bottom: 25px;">
              Throughout this study, you will use a <strong>dial</strong> to continuously rate your level of <strong>sexual arousal</strong> while watching videos. The dial appears at the top of the screen during each video.
            </p>

            <div style="background: #e3f2fd; border-left: 4px solid #2196f3; padding: 18px 22px; margin-bottom: 20px;">
              <p style="font-size: 20px; font-weight: bold; margin: 0 0 10px 0;">Step 1: Understand the Scale</p>
              <p style="font-size: 18px; margin: 0; line-height: 1.5;">
                <strong>0</strong> = No sexual arousal at all<br>
                <strong>10</strong> = Highest sexual arousal you have experienced
              </p>
            </div>

            <div style="background: #e8f5e9; border-left: 4px solid #4caf50; padding: 18px 22px; margin-bottom: 20px;">
              <p style="font-size: 20px; font-weight: bold; margin: 0 0 10px 0;">Step 2: Adjust Continuously During the Video</p>
              <p style="font-size: 18px; margin: 0 0 12px 0; line-height: 1.5;">As you watch, <strong>turn the dial</strong> to adjust your rating:</p>
              <ul style="font-size: 18px; margin: 0; padding-left: 25px; line-height: 1.8;">
                <li><strong>Turn RIGHT (clockwise)</strong> = Your sexual arousal is <strong>increasing</strong></li>
                <li><strong>Turn LEFT (counter-clockwise)</strong> = Your sexual arousal is <strong>decreasing</strong></li>
              </ul>
              <p style="font-size: 16px; margin: 15px 0 0 0; color: #555; line-height: 1.5;">Turn the dial when you notice a change in your sexual arousal, however slight. There is no right or wrong answer. Simply reflect what you are feeling in the moment.</p>
            </div>

            <div style="background: #fff3e0; border-left: 4px solid #ff9800; padding: 18px 22px; margin-bottom: 20px;">
              <p style="font-size: 20px; font-weight: bold; margin: 0 0 10px 0;">Step 3: Set Your Baseline Before Each Video</p>
              <p style="font-size: 18px; margin: 0; line-height: 1.5;">Before each video starts, you will set the dial to your <strong>current</strong> level of sexual arousal, then <strong>click the dial button</strong> to begin the video.</p>
            </div>

            <p style="font-size: 18px; color: #555; margin-top: 30px;">
              <strong>Click the dial button</strong> to continue.
            </p>
          </div>
          <div style="flex-shrink: 0; text-align: center;">
            ${createInteractiveDialHTML()}
            <p style="font-size: 14px; color: #666; margin-top: 50px;">The dial will appear like this<br>at the top of the video.</p>
          </div>
        </div>
      </div>
    `,
    choices: ["n", "N"],
    data: { task: "dial_instructions" },
    on_load: function () {
      // Make the dial interactive with wheel input
      var dialPointer = document.getElementById("instruction-dial-pointer");
      var dialValueDisplay = document.getElementById("dial-value-display");
      var currentValue = 5;
      var angleStart = 225;
      var angleEnd = -45;
      var angleRange = angleStart - angleEnd;
      var scrollStep = 0.5;

      function valueToAngle(value) {
        var normalized = value / 10;
        return angleStart - normalized * angleRange;
      }

      function updateDial(value) {
        currentValue = Math.max(0, Math.min(10, value));
        var angle = valueToAngle(currentValue);
        var rotation = angle - 90;
        dialPointer.style.transform = "rotate(" + -rotation + "deg)";
        dialValueDisplay.textContent =
          "Current Value: " + Math.round(currentValue * 10) / 10;
      }

      // Handle wheel input for dial control
      var handleWheel = function (e) {
        e.preventDefault();
        e.stopPropagation();
        // Counter-clockwise on physical dial (positive deltaY) = clockwise on screen = increase value
        var scrollDirection = e.deltaY > 0 ? 1 : -1;
        var newValue = currentValue + scrollDirection * scrollStep;
        updateDial(newValue);
      };

      document.addEventListener("wheel", handleWheel, { passive: false });
      window.addEventListener("wheel", handleWheel, { passive: false });

      // Persist dial value when proceeding (click is handled globally)
      var clickHandler = function (e) {
        if (e.button === 0) {
          window.__dialPersistedValue = currentValue;
          console.log("Calibration complete, persisted value:", currentValue);
        }
      };
      document.addEventListener("click", clickHandler);

      // Store cleanup function
      window._dialInstructionsCleanup = function () {
        document.removeEventListener("wheel", handleWheel);
        window.removeEventListener("wheel", handleWheel);
        document.removeEventListener("click", clickHandler);
      };

      // Initialize dial position - use persisted value if available
      var startValue =
        window.__dialPersistedValue !== undefined
          ? window.__dialPersistedValue
          : 5;
      updateDial(startValue);
    },
    on_start: function () {
      sendMonitorUpdate({
        type: "trial_update",
        task: "dial_instructions",
        instruction: "Dial Instructions",
      });
    },
    on_finish: function (data) {
      // Clean up wheel listeners
      if (window._dialInstructionsCleanup) {
        window._dialInstructionsCleanup();
        delete window._dialInstructionsCleanup;
      }
      sendMonitorUpdate({
        type: "instruction_complete",
        task: "dial_instructions",
        instruction: "Dial Instructions",
        rt: data.rt,
      });
    },
  };

  // Fullscreen trial
  var enter_fullscreen = {
    type: FullscreenPlugin,
    fullscreen_mode: true,
    message:
      '<p style="font-size: 20px;">This experiment requires fullscreen mode.<br><br>Click the button below to enter fullscreen and begin.</p>',
    button_label: "Enter Fullscreen",
    data: { task: "fullscreen" },
  };

  // Initial study overview - explains experiment structure and RA involvement
  var study_overview = {
    type: HtmlKeyboardResponsePlugin,
    stimulus: `
      <div style="display: flex; align-items: center; justify-content: center; padding: 40px;">
        <div style="text-align: left; max-width: 800px;">
          <h1 style="font-size: 32px; font-weight: bold; margin-bottom: 30px; text-align: center;">Welcome to the Study</h1>

          <p style="font-size: 20px; line-height: 1.8; margin-bottom: 25px;">
            Thank you for participating. This study consists of <strong>three blocks</strong>, each involving a different approach to watching videos.
          </p>

          <p style="font-size: 20px; line-height: 1.8; margin-bottom: 25px;">
            <strong>Here's how the study will proceed:</strong>
          </p>

          <ol style="font-size: 20px; line-height: 2; margin-bottom: 25px; padding-left: 30px;">
            <li>You will first learn how to use the arousal dial and watch a nature video to practice.</li>
            <li>Before each of the three blocks, you will listen to audio instructions explaining a new approach.</li>
            <li><strong>After each audio instruction, the Research Assistant (RA) will come to you</strong> to answer any questions and ensure you understand the approach before continuing.</li>
            <li>You will then watch a practice video followed by six main videos for that block.</li>
          </ol>

          <p style="font-size: 20px; line-height: 1.8; margin-bottom: 25px; background: #f0f7ff; padding: 20px; border-left: 4px solid #3498db;">
            <strong>Important:</strong> The RA will return to check in with you <strong>three times</strong> during this study—once before each block begins. Please wait for them when prompted.
          </p>

          <p style="font-size: 20px; line-height: 1.8;">
            Press the <strong>button dial</strong> when you are ready to begin.
          </p>
        </div>
      </div>
    `,
    choices: ["n", "N"],
    data: { task: "study_overview" },
    on_start: function () {
      sendMonitorUpdate({
        type: "trial_update",
        task: "study_overview",
        instruction: "Study Overview",
      });
    },
    on_finish: function (data) {
      sendMonitorUpdate({
        type: "instruction_complete",
        task: "study_overview",
        instruction: "Study Overview",
        rt: data.rt,
      });
    },
  };

  // Nature video with dial rating (replaces simple video playback)
  var nature_video_dial = {
    type: VideoDialRatingPlugin,
    stimulus: ["assets/nature.mp4"],
    fullscreen: true,
    dial_start: 5,
    sample_rate_ms: 10,
    trial_ends_after_video: true,
    countdown_duration: 10,
    show_trail: false,
    data: {
      task: "nature_video_dial",
      filename: "nature.mp4",
    },
    on_start: function () {
      sendMonitorUpdate({ type: "trial_update", task: "nature_video_dial" });
    },
  };

  // Audio test slide - plays a short audio to test headphones
  var audio_test = {
    type: HtmlButtonResponsePlugin,
    stimulus: `
      <div style="display: flex; align-items: center; justify-content: center; min-height: 60vh; padding: 40px;">
        <div style="text-align: center; max-width: 700px;">
          <h1 style="font-size: 32px; font-weight: bold; margin-bottom: 30px; color: #2c3e50;">Audio Test</h1>
          <audio id="test-audio" controls style="margin-bottom: 30px;">
            <source src="assets/natural.mp3" type="audio/mpeg">
          </audio>
          <div style="background: #e8f4fd; border: 2px solid #3498db; border-radius: 10px; padding: 30px; margin-bottom: 30px;">
            <p style="font-size: 20px; line-height: 1.6; margin: 0; color: #2c3e50;">
              Please use the audio player above to test that your headphones are working correctly.
              Adjust the volume to a comfortable level.
            </p>
          </div>
          <p style="font-size: 16px; color: #999; font-style: italic;">
            (RA: If there are audio issues, please assist the participant before continuing)
          </p>
        </div>
      </div>
    `,
    choices: ["Continue"],
    data: { task: "audio_test" },
    on_start: function () {
      sendMonitorUpdate({
        type: "trial_update",
        task: "audio_test",
        instruction: "Audio Test",
      });
    },
    on_load: function () {
      // Set moderate default volume
      var audio = document.getElementById("test-audio");
      if (audio) {
        audio.volume = 0.5;
      }
    },
    on_finish: function (data) {
      sendMonitorUpdate({
        type: "instruction_complete",
        task: "audio_test",
        instruction: "Audio Test",
        rt: data.rt,
      });
    },
  };

  // Dial test slide - allows participant to try the dial before starting
  var dial_test = {
    type: HtmlKeyboardResponsePlugin,
    stimulus: `
      <div style="display: flex; align-items: center; justify-content: center; min-height: 70vh; padding: 40px;">
        <div style="display: flex; align-items: center; gap: 60px; max-width: 1000px;">
          <div style="flex: 1; text-align: left;">
            <h1 style="font-size: 32px; font-weight: bold; margin-bottom: 30px; color: #2c3e50;">Dial Test</h1>
            <div style="background: #e8f5e9; border: 2px solid #4caf50; border-radius: 10px; padding: 25px; margin-bottom: 25px;">
              <p style="font-size: 20px; line-height: 1.6; margin: 0; color: #2c3e50;">
                Please test the dial on the right by <strong>turning it left and right</strong>.
                Watch the pointer move and the value change as you adjust the dial.
              </p>
            </div>
            <p style="font-size: 18px; color: #555; margin-bottom: 20px; line-height: 1.6;">
              The dial should respond smoothly to your movements. You will use this dial throughout the study to rate your arousal level while watching videos.
            </p>
            <div style="background: #f3e5f5; border-left: 4px solid #9c27b0; padding: 18px 22px; margin-bottom: 25px;">
              <p style="font-size: 18px; font-weight: bold; margin: 0 0 10px 0;">When ready:</p>
              <ol style="font-size: 18px; margin: 0; padding-left: 25px; line-height: 1.8;">
                <li>Turn the dial until the arrow <strong>points straight up (to 5)</strong></li>
                <li><strong>Click the dial button</strong> to continue</li>
              </ol>
            </div>
            <p style="font-size: 16px; color: #999; font-style: italic;">
              (RA: If the dial is not responding, please check the equipment before continuing)
            </p>
          </div>
          <div style="flex-shrink: 0; text-align: center;">
            <div id="test-dial-container" style="position: relative; width: 280px; height: 280px;">
              <svg id="test-dial-svg" width="280" height="280" viewBox="0 0 300 300" xmlns="http://www.w3.org/2000/svg">
                <defs>
                  <radialGradient id="testKnobGradient" cx="50%" cy="50%" r="50%" fx="50%" fy="50%">
                    <stop offset="0%" style="stop-color:#444;stop-opacity:1" />
                    <stop offset="85%" style="stop-color:#111;stop-opacity:1" />
                    <stop offset="100%" style="stop-color:#000;stop-opacity:1" />
                  </radialGradient>
                </defs>
                <circle cx="150" cy="150" r="145" fill="#050505" stroke="#333" stroke-width="2" />
                <g>
                  <!-- Major ticks (integers 0-10) -->
                  <line x1="58.1" y1="241.9" x2="68.7" y2="231.3" stroke="white" stroke-width="3" stroke-linecap="round" />
                  <line x1="26.4" y1="190.2" x2="40.6" y2="185.5" stroke="white" stroke-width="3" stroke-linecap="round" />
                  <line x1="21.6" y1="129.7" x2="36.4" y2="132.0" stroke="white" stroke-width="3" stroke-linecap="round" />
                  <line x1="44.8" y1="73.6" x2="57.0" y2="82.4" stroke="white" stroke-width="3" stroke-linecap="round" />
                  <line x1="91.0" y1="34.2" x2="97.8" y2="47.5" stroke="white" stroke-width="3" stroke-linecap="round" />
                  <line x1="150.0" y1="20.0" x2="150.0" y2="35.0" stroke="white" stroke-width="3" stroke-linecap="round" />
                  <line x1="209.0" y1="34.2" x2="202.2" y2="47.5" stroke="white" stroke-width="3" stroke-linecap="round" />
                  <line x1="255.2" y1="73.6" x2="243.0" y2="82.4" stroke="white" stroke-width="3" stroke-linecap="round" />
                  <line x1="278.4" y1="129.7" x2="263.6" y2="132.0" stroke="white" stroke-width="3" stroke-linecap="round" />
                  <line x1="273.6" y1="190.2" x2="259.4" y2="185.5" stroke="white" stroke-width="3" stroke-linecap="round" />
                  <line x1="241.9" y1="241.9" x2="231.3" y2="231.3" stroke="white" stroke-width="3" stroke-linecap="round" />
                  <!-- Minor ticks (0.5 increments) -->
                  <line x1="39.2" y1="217.9" x2="46.0" y2="213.7" stroke="rgba(255,255,255,0.7)" stroke-width="2" stroke-linecap="round" />
                  <line x1="20.4" y1="160.2" x2="28.4" y2="159.6" stroke="rgba(255,255,255,0.7)" stroke-width="2" stroke-linecap="round" />
                  <line x1="29.9" y1="100.3" x2="37.3" y2="103.3" stroke="rgba(255,255,255,0.7)" stroke-width="2" stroke-linecap="round" />
                  <line x1="65.6" y1="51.1" x2="70.8" y2="57.2" stroke="rgba(255,255,255,0.7)" stroke-width="2" stroke-linecap="round" />
                  <line x1="119.7" y1="23.6" x2="121.5" y2="31.4" stroke="rgba(255,255,255,0.7)" stroke-width="2" stroke-linecap="round" />
                  <line x1="180.3" y1="23.6" x2="178.5" y2="31.4" stroke="rgba(255,255,255,0.7)" stroke-width="2" stroke-linecap="round" />
                  <line x1="234.4" y1="51.1" x2="229.2" y2="57.2" stroke="rgba(255,255,255,0.7)" stroke-width="2" stroke-linecap="round" />
                  <line x1="270.1" y1="100.3" x2="262.7" y2="103.3" stroke="rgba(255,255,255,0.7)" stroke-width="2" stroke-linecap="round" />
                  <line x1="279.6" y1="160.2" x2="271.6" y2="159.6" stroke="rgba(255,255,255,0.7)" stroke-width="2" stroke-linecap="round" />
                  <line x1="260.8" y1="217.9" x2="254.0" y2="213.7" stroke="rgba(255,255,255,0.7)" stroke-width="2" stroke-linecap="round" />
                </g>
                <g>
                  <text x="82.8" y="217.2" fill="white" font-family="Arial, sans-serif" font-weight="bold" font-size="20" text-anchor="middle" dominant-baseline="middle">0</text>
                  <text x="59.6" y="179.4" fill="white" font-family="Arial, sans-serif" font-weight="bold" font-size="20" text-anchor="middle" dominant-baseline="middle">1</text>
                  <text x="56.2" y="135.1" fill="white" font-family="Arial, sans-serif" font-weight="bold" font-size="20" text-anchor="middle" dominant-baseline="middle">2</text>
                  <text x="73.1" y="94.2" fill="white" font-family="Arial, sans-serif" font-weight="bold" font-size="20" text-anchor="middle" dominant-baseline="middle">3</text>
                  <text x="106.9" y="65.4" fill="white" font-family="Arial, sans-serif" font-weight="bold" font-size="20" text-anchor="middle" dominant-baseline="middle">4</text>
                  <text x="150.0" y="55.0" fill="white" font-family="Arial, sans-serif" font-weight="bold" font-size="20" text-anchor="middle" dominant-baseline="middle">5</text>
                  <text x="193.1" y="65.4" fill="white" font-family="Arial, sans-serif" font-weight="bold" font-size="20" text-anchor="middle" dominant-baseline="middle">6</text>
                  <text x="226.9" y="94.2" fill="white" font-family="Arial, sans-serif" font-weight="bold" font-size="20" text-anchor="middle" dominant-baseline="middle">7</text>
                  <text x="243.8" y="135.1" fill="white" font-family="Arial, sans-serif" font-weight="bold" font-size="20" text-anchor="middle" dominant-baseline="middle">8</text>
                  <text x="240.4" y="179.4" fill="white" font-family="Arial, sans-serif" font-weight="bold" font-size="20" text-anchor="middle" dominant-baseline="middle">9</text>
                  <text x="217.2" y="217.2" fill="white" font-family="Arial, sans-serif" font-weight="bold" font-size="20" text-anchor="middle" dominant-baseline="middle">10</text>
                </g>
                <circle cx="150" cy="150" r="75" fill="#222" stroke="#111" stroke-width="1" />
                <circle cx="150" cy="150" r="65" fill="url(#testKnobGradient)" stroke="#000" stroke-width="2" />
                <circle cx="150" cy="150" r="60" fill="none" stroke="#333" stroke-width="1" opacity="0.5" />
                <g id="test-dial-pointer" style="transform-origin: 150px 150px;">
                  <line x1="150" y1="130" x2="150" y2="95" stroke="white" stroke-width="4" stroke-linecap="round" />
                </g>
              </svg>
              <p id="test-dial-value" style="font-size: 24px; color: #333; margin-top: 15px; text-align: center; font-weight: bold;">Current Value: 5</p>
            </div>
          </div>
        </div>
      </div>
    `,
    choices: ["n", "N"],
    data: { task: "dial_test" },
    on_start: function () {
      sendMonitorUpdate({
        type: "trial_update",
        task: "dial_test",
        instruction: "Dial Test",
      });
    },
    on_load: function () {
      // Make the dial interactive with wheel input
      var dialPointer = document.getElementById("test-dial-pointer");
      var dialValueDisplay = document.getElementById("test-dial-value");
      var currentValue = 5;
      var angleStart = 225;
      var angleEnd = -45;
      var angleRange = angleStart - angleEnd;
      var scrollStep = 0.5;

      function valueToAngle(value) {
        var normalized = value / 10;
        return angleStart - normalized * angleRange;
      }

      function updateDial(value) {
        currentValue = Math.max(0, Math.min(10, value));
        var angle = valueToAngle(currentValue);
        var rotation = angle - 90;
        dialPointer.style.transform = "rotate(" + -rotation + "deg)";
        dialValueDisplay.textContent =
          "Current Value: " + Math.round(currentValue * 10) / 10;
      }

      // Handle wheel input for dial control
      var handleWheel = function (e) {
        e.preventDefault();
        e.stopPropagation();
        // Counter-clockwise on physical dial (positive deltaY) = clockwise on screen = increase value
        var scrollDirection = e.deltaY > 0 ? 1 : -1;
        var newValue = currentValue + scrollDirection * scrollStep;
        updateDial(newValue);
      };

      document.addEventListener("wheel", handleWheel, { passive: false });
      window.addEventListener("wheel", handleWheel, { passive: false });

      // Persist dial value when proceeding (click is handled globally)
      var clickHandler = function (e) {
        if (e.button === 0) {
          window.__dialPersistedValue = currentValue;
          console.log("Dial test complete, persisted value:", currentValue);
        }
      };
      document.addEventListener("click", clickHandler);

      // Store cleanup function
      window._dialTestCleanup = function () {
        document.removeEventListener("wheel", handleWheel);
        window.removeEventListener("wheel", handleWheel);
        document.removeEventListener("click", clickHandler);
      };

      // Initialize dial position - use persisted value if available
      var startValue =
        window.__dialPersistedValue !== undefined
          ? window.__dialPersistedValue
          : 5;
      updateDial(startValue);
    },
    on_finish: function (data) {
      // Clean up wheel listeners
      if (window._dialTestCleanup) {
        window._dialTestCleanup();
        delete window._dialTestCleanup;
      }
      sendMonitorUpdate({
        type: "instruction_complete",
        task: "dial_test",
        instruction: "Dial Test",
        rt: data.rt,
      });
    },
  };

  // Build timeline - removed fullscreen entry, now starts with preload and equipment tests
  timeline.push(preload);
  timeline.push(audio_test);
  timeline.push(dial_calibration);
  timeline.push(dial_test);
  timeline.push(pid_loop);

  // Add study overview explaining RA involvement
  timeline.push(study_overview);

  // Transition screen
  timeline.push({
    type: HtmlKeyboardResponsePlugin,
    stimulus: "",
    choices: "NO_KEYS",
    trial_duration: 100,
    data: { task: "transition" },
  });

  // Add dial calibration and instructions BEFORE nature video so participants know how to use it
  timeline.push(dial_calibration);
  timeline.push(dial_instructions);

  // Transition before nature video
  timeline.push({
    type: HtmlKeyboardResponsePlugin,
    stimulus: "",
    choices: "NO_KEYS",
    trial_duration: 100,
    data: { task: "transition" },
  });

  timeline.push(nature_instructions);
  timeline.push(nature_video_dial);

  // Add rating questions after nature video
  timeline.push(rating_procedure);

  // Script-style subtitle display - shows all paragraphs with underline on current spoken segment
  function setupScriptSubtitles(audioElement, scriptData, containerElement) {
    var currentParagraphIdx = null;

    // Load Inter font for nice typography
    if (!document.getElementById("inter-font-link")) {
      var link = document.createElement("link");
      link.id = "inter-font-link";
      link.rel = "stylesheet";
      link.href =
        "https://fonts.googleapis.com/css2?family=Inter:wght@400..600&display=swap";
      document.head.appendChild(link);
    }

    // Build the HTML for all paragraphs with spans for each segment
    function initializeScript() {
      var html =
        '<div class="script-container" style="' +
        "max-width: 70ch;" +
        "margin: 0 auto;" +
        "text-align: left;" +
        '">';

      scriptData.paragraphs.forEach(function (paragraph, pIdx) {
        html +=
          '<p id="para-' +
          pIdx +
          '" class="script-paragraph" style="' +
          "font-family: 'Inter', Helvetica, Arial, sans-serif;" +
          "font-size: 20px;" +
          "line-height: 1.8;" +
          "color: #333;" +
          "margin-bottom: 24px;" +
          '">';

        paragraph.segments.forEach(function (segment, sIdx) {
          var segmentId = "seg-" + pIdx + "-" + sIdx;
          html +=
            '<span id="' +
            segmentId +
            '" ' +
            'data-para="' +
            pIdx +
            '" ' +
            'data-start="' +
            segment.start +
            '" ' +
            'data-end="' +
            segment.end +
            '" ' +
            'style="transition: all 0.15s ease;">' +
            segment.text +
            " " +
            "</span>";
        });

        html += "</p>";
      });

      html += "</div>";
      containerElement.innerHTML = html;
    }

    // Update underline based on current audio time
    function updateUnderline(currentTime) {
      var allSegments = containerElement.querySelectorAll("span[data-start]");

      allSegments.forEach(function (span) {
        var start = parseInt(span.getAttribute("data-start"));
        var end = parseInt(span.getAttribute("data-end"));

        if (currentTime >= start && currentTime <= end) {
          // Currently being spoken - underline it
          span.style.textDecoration = "underline";
          span.style.textDecorationColor = "#3498db";
          span.style.textDecorationThickness = "3px";
          span.style.textUnderlineOffset = "4px";

          // Scroll to paragraph only when paragraph changes (not on every segment)
          var paraIdx = span.getAttribute("data-para");
          if (currentParagraphIdx !== paraIdx) {
            currentParagraphIdx = paraIdx;
            var paragraph = document.getElementById("para-" + paraIdx);
            if (paragraph) {
              paragraph.scrollIntoView({ behavior: "smooth", block: "center" });
            }
          }
        } else {
          // Not currently being spoken - no underline
          span.style.textDecoration = "none";
        }
      });
    }

    // Listen for audio time updates
    audioElement.addEventListener("timeupdate", function () {
      var currentTime = audioElement.currentTime * 1000; // Convert to ms
      updateUnderline(currentTime);
    });

    // Initialize the script display
    initializeScript();
  }

  // Block practice components for each condition
  // Helper to get display name for condition
  function getConditionDisplayName(condition) {
    var names = {
      neutral: "Natural",
      participatory: "Participating",
      observatory: "Observing",
    };
    return names[condition] || condition;
  }

  // Store audio file paths for repeat functionality
  var audioFiles = {
    neutral: "assets/natural.mp3",
    participatory: "assets/participate.mp3",
    observatory: "assets/observe.mp3",
  };

  var scriptFiles = {
    neutral: "assets/scripts/natural-script.json",
    participatory: "assets/scripts/participate-script.json",
    observatory: "assets/scripts/observe-script.json",
  };

  // Variable to store last played audio info for repeat
  var lastAudioCondition = "";

  var blockPractice = {
    neutral: {
      audio_intro: {
        type: HtmlKeyboardResponsePlugin,
        stimulus: `
          <div style="display: flex; align-items: center; justify-content: center; padding: 40px;">
            <div style="text-align: center; max-width: 750px;">
              <p style="font-size: 20px; text-align: center; margin-bottom: 25px;">
                You will now listen to audio instructions that will teach you how to apply a <strong>natural</strong> approach.
              </p>
              <p style="font-size: 18px; text-align: center; color: #555; line-height: 1.6;">
                As the audio plays, you may follow along with the words on the screen or on your own copy. If you have any questions or anything is unclear, feel free to jot down notes on the sheet.
              </p>
              <p style="font-size: 16px; color: #888; margin-top: 30px;">
                The audio will begin automatically.
              </p>
            </div>
          </div>
        `,
        choices: "NO_KEYS",
        trial_duration: 3000,
        data: { task: "audio_intro", condition: "neutral" },
      },
      audio_play: {
        type: HtmlKeyboardResponsePlugin,
        stimulus: `
          <audio id="audio-instruction" autoplay><source src="assets/natural.mp3" type="audio/mpeg"></audio>
          <div style="display: flex; align-items: center; justify-content: center; min-height: 80vh; flex-direction: column;">
            <h2 style="font-size: 28px; text-align: center; color: #333; margin-bottom: 30px;">Natural Instructions</h2>
            <div id="script-display" style="width: 85ch; max-width: 95vw; height: 600px; overflow-y: auto; padding: 40px; background: #f9f9f9; border-radius: 12px;"></div>
          </div>
        `,
        choices: ["r", "R"],
        on_load: function () {
          lastAudioCondition = "neutral";
          var audio = document.getElementById("audio-instruction");
          var scriptEl = document.getElementById("script-display");
          fetch("assets/scripts/natural-script.json")
            .then(function (response) {
              return response.json();
            })
            .then(function (scriptData) {
              setupScriptSubtitles(audio, scriptData, scriptEl);
            });
          audio.addEventListener("ended", function () {
            jsPsych.finishTrial();
          });
        },
        data: { task: "audio_play", condition: "neutral" },
      },
      ra_wait: {
        type: HtmlKeyboardResponsePlugin,
        stimulus: function () {
          const monitorConnected = monitorSocket && monitorSocket.readyState === WebSocket.OPEN;
          const skipInstruction = monitorConnected
            ? "(RA: Press <strong>N</strong> when the Q&A session is complete, or press <strong>R</strong> to repeat the audio instructions)"
            : "(Press <strong>R</strong> to skip RA wait - monitor not connected)";
          return `
          <div style="display: flex; align-items: center; justify-content: center; min-height: 70vh; padding: 40px;">
            <div style="text-align: center; max-width: 700px;">
              <h1 style="font-size: 36px; font-weight: bold; margin-bottom: 30px; color: #2c3e50;">Please Wait</h1>
              <div style="background: #e8f4fd; border: 2px solid #3498db; border-radius: 10px; padding: 30px; margin-bottom: 30px;">
                <p style="font-size: 24px; line-height: 1.6; margin: 0; color: #2c3e50;">
                  The Research Assistant will now come to answer any questions you may have about the instructions you just heard.
                </p>
              </div>
              <p style="font-size: 20px; color: #666; margin-bottom: 40px;">
                Please wait here until the RA arrives.
              </p>
              <p style="font-size: 16px; color: #999; font-style: italic;">
                ${skipInstruction}
              </p>
            </div>
          </div>
        `;
        },
        choices: ["n", "N", "r", "R"],
        data: { task: "ra_wait", condition: "neutral" },
        on_finish: function (data) {
          // Check if R was pressed to repeat audio (only if monitor connected)
          const monitorConnected = monitorSocket && monitorSocket.readyState === WebSocket.OPEN;
          if ((data.response === "r" || data.response === "R") && monitorConnected) {
            data.repeat_audio = true;
          }
          // If monitor not connected, R just skips (no repeat_audio flag)
        },
      },
      practice_intro: {
        type: HtmlKeyboardResponsePlugin,
        stimulus:
          '<div style="display: flex; align-items: center; justify-content: center; min-height: 50vh;"><p style="font-size: 20px; text-align: center;">You will now apply the approach you learned onto a guided video.<br><br><span style="color: #888; font-size: 16px;">Press the <strong>button dial</strong> to continue.</span></p></div>',
        choices: ["n", "N"],
        data: { task: "practice_intro", condition: "neutral" },
      },
      practice_video: {
        type: VideoKeyboardResponsePlugin,
        stimulus: ["assets/naturalpractice.mp4"],
        choices: ["r", "R"],
        width: 1000,
        height: 750,
        autoplay: true,
        response_ends_trial: true,
        trial_ends_after_video: true,
        data: {
          task: "practice_video",
          condition: "neutral",
          filename: "naturalpractice.mp4",
        },
      },
    },
    participatory: {
      audio_intro: {
        type: HtmlKeyboardResponsePlugin,
        stimulus: `
          <div style="display: flex; align-items: center; justify-content: center; padding: 40px;">
            <div style="text-align: center; max-width: 750px;">
              <p style="font-size: 20px; text-align: center; margin-bottom: 25px;">
                You will now listen to audio instructions that will teach you how to apply a <strong>participating</strong> approach.
              </p>
              <p style="font-size: 18px; text-align: center; color: #555; line-height: 1.6;">
                As the audio plays, you may follow along with the words on the screen or on your own copy. If you have any questions or anything is unclear, feel free to jot down notes on the sheet.
              </p>
              <p style="font-size: 16px; color: #888; margin-top: 30px;">
                The audio will begin automatically.
              </p>
            </div>
          </div>
        `,
        choices: "NO_KEYS",
        trial_duration: 3000,
        data: { task: "audio_intro", condition: "participatory" },
      },
      audio_play: {
        type: HtmlKeyboardResponsePlugin,
        stimulus: `
          <audio id="audio-instruction" autoplay><source src="assets/participate.mp3" type="audio/mpeg"></audio>
          <div style="display: flex; align-items: center; justify-content: center; min-height: 80vh; flex-direction: column;">
            <h2 style="font-size: 28px; text-align: center; color: #333; margin-bottom: 30px;">Participating Instructions</h2>
            <div id="script-display" style="width: 85ch; max-width: 95vw; height: 600px; overflow-y: auto; padding: 40px; background: #f9f9f9; border-radius: 12px;"></div>
          </div>
        `,
        choices: ["r", "R"],
        on_load: function () {
          lastAudioCondition = "participatory";
          var audio = document.getElementById("audio-instruction");
          var scriptEl = document.getElementById("script-display");
          fetch("assets/scripts/participate-script.json")
            .then(function (response) {
              return response.json();
            })
            .then(function (scriptData) {
              setupScriptSubtitles(audio, scriptData, scriptEl);
            });
          audio.addEventListener("ended", function () {
            jsPsych.finishTrial();
          });
        },
        data: { task: "audio_play", condition: "participatory" },
      },
      ra_wait: {
        type: HtmlKeyboardResponsePlugin,
        stimulus: function () {
          const monitorConnected = monitorSocket && monitorSocket.readyState === WebSocket.OPEN;
          const skipInstruction = monitorConnected
            ? "(RA: Press <strong>N</strong> when the Q&A session is complete, or press <strong>R</strong> to repeat the audio instructions)"
            : "(Press <strong>R</strong> to skip RA wait - monitor not connected)";
          return `
          <div style="display: flex; align-items: center; justify-content: center; min-height: 70vh; padding: 40px;">
            <div style="text-align: center; max-width: 700px;">
              <h1 style="font-size: 36px; font-weight: bold; margin-bottom: 30px; color: #2c3e50;">Please Wait</h1>
              <div style="background: #e8f4fd; border: 2px solid #3498db; border-radius: 10px; padding: 30px; margin-bottom: 30px;">
                <p style="font-size: 24px; line-height: 1.6; margin: 0; color: #2c3e50;">
                  The Research Assistant will now come to answer any questions you may have about the instructions you just heard.
                </p>
              </div>
              <p style="font-size: 20px; color: #666; margin-bottom: 40px;">
                Please wait here until the RA arrives.
              </p>
              <p style="font-size: 16px; color: #999; font-style: italic;">
                ${skipInstruction}
              </p>
            </div>
          </div>
        `;
        },
        choices: ["n", "N", "r", "R"],
        data: { task: "ra_wait", condition: "participatory" },
        on_finish: function (data) {
          const monitorConnected = monitorSocket && monitorSocket.readyState === WebSocket.OPEN;
          if ((data.response === "r" || data.response === "R") && monitorConnected) {
            data.repeat_audio = true;
          }
        },
      },
      practice_intro: {
        type: HtmlKeyboardResponsePlugin,
        stimulus:
          '<div style="display: flex; align-items: center; justify-content: center; min-height: 50vh;"><p style="font-size: 20px; text-align: center;">You will now apply the approach you learned onto a guided video.<br><br><span style="color: #888; font-size: 16px;">Press the <strong>button dial</strong> to continue.</span></p></div>',
        choices: ["n", "N"],
        data: { task: "practice_intro", condition: "participatory" },
      },
      practice_video: {
        type: VideoKeyboardResponsePlugin,
        stimulus: ["assets/participatepractice.mp4"],
        choices: ["r", "R"],
        width: 1000,
        height: 750,
        autoplay: true,
        response_ends_trial: true,
        trial_ends_after_video: true,
        data: {
          task: "practice_video",
          condition: "participatory",
          filename: "participatepractice.mp4",
        },
      },
    },
    observatory: {
      audio_intro: {
        type: HtmlKeyboardResponsePlugin,
        stimulus: `
          <div style="display: flex; align-items: center; justify-content: center; padding: 40px;">
            <div style="text-align: center; max-width: 750px;">
              <p style="font-size: 20px; text-align: center; margin-bottom: 25px;">
                You will now listen to audio instructions that will teach you how to apply an <strong>observing</strong> approach.
              </p>
              <p style="font-size: 18px; text-align: center; color: #555; line-height: 1.6;">
                As the audio plays, you may follow along with the words on the screen or on your own copy. If you have any questions or anything is unclear, feel free to jot down notes on the sheet.
              </p>
              <p style="font-size: 16px; color: #888; margin-top: 30px;">
                The audio will begin automatically.
              </p>
            </div>
          </div>
        `,
        choices: "NO_KEYS",
        trial_duration: 3000,
        data: { task: "audio_intro", condition: "observatory" },
      },
      audio_play: {
        type: HtmlKeyboardResponsePlugin,
        stimulus: `
          <audio id="audio-instruction" autoplay><source src="assets/observe.mp3" type="audio/mpeg"></audio>
          <div style="display: flex; align-items: center; justify-content: center; min-height: 80vh; flex-direction: column;">
            <h2 style="font-size: 28px; text-align: center; color: #333; margin-bottom: 30px;">Observing Instructions</h2>
            <div id="script-display" style="width: 85ch; max-width: 95vw; height: 600px; overflow-y: auto; padding: 40px; background: #f9f9f9; border-radius: 12px;"></div>
          </div>
        `,
        choices: ["r", "R"],
        on_load: function () {
          lastAudioCondition = "observatory";
          var audio = document.getElementById("audio-instruction");
          var scriptEl = document.getElementById("script-display");
          fetch("assets/scripts/observe-script.json")
            .then(function (response) {
              return response.json();
            })
            .then(function (scriptData) {
              setupScriptSubtitles(audio, scriptData, scriptEl);
            });
          audio.addEventListener("ended", function () {
            jsPsych.finishTrial();
          });
        },
        data: { task: "audio_play", condition: "observatory" },
      },
      ra_wait: {
        type: HtmlKeyboardResponsePlugin,
        stimulus: function () {
          const monitorConnected = monitorSocket && monitorSocket.readyState === WebSocket.OPEN;
          const skipInstruction = monitorConnected
            ? "(RA: Press <strong>N</strong> when the Q&A session is complete, or press <strong>R</strong> to repeat the audio instructions)"
            : "(Press <strong>R</strong> to skip RA wait - monitor not connected)";
          return `
          <div style="display: flex; align-items: center; justify-content: center; min-height: 70vh; padding: 40px;">
            <div style="text-align: center; max-width: 700px;">
              <h1 style="font-size: 36px; font-weight: bold; margin-bottom: 30px; color: #2c3e50;">Please Wait</h1>
              <div style="background: #e8f4fd; border: 2px solid #3498db; border-radius: 10px; padding: 30px; margin-bottom: 30px;">
                <p style="font-size: 24px; line-height: 1.6; margin: 0; color: #2c3e50;">
                  The Research Assistant will now come to answer any questions you may have about the instructions you just heard.
                </p>
              </div>
              <p style="font-size: 20px; color: #666; margin-bottom: 40px;">
                Please wait here until the RA arrives.
              </p>
              <p style="font-size: 16px; color: #999; font-style: italic;">
                ${skipInstruction}
              </p>
            </div>
          </div>
        `;
        },
        choices: ["n", "N", "r", "R"],
        data: { task: "ra_wait", condition: "observatory" },
        on_finish: function (data) {
          const monitorConnected = monitorSocket && monitorSocket.readyState === WebSocket.OPEN;
          if ((data.response === "r" || data.response === "R") && monitorConnected) {
            data.repeat_audio = true;
          }
        },
      },
      practice_intro: {
        type: HtmlKeyboardResponsePlugin,
        stimulus:
          '<div style="display: flex; align-items: center; justify-content: center; min-height: 50vh;"><p style="font-size: 20px; text-align: center;">You will now apply the approach you learned onto a guided video.<br><br><span style="color: #888; font-size: 16px;">Press the <strong>button dial</strong> to continue.</span></p></div>',
        choices: ["n", "N"],
        data: { task: "practice_intro", condition: "observatory" },
      },
      practice_video: {
        type: VideoKeyboardResponsePlugin,
        stimulus: ["assets/observepractice.mp4"],
        choices: ["r", "R"],
        width: 1000,
        height: 750,
        autoplay: true,
        response_ends_trial: true,
        trial_ends_after_video: true,
        data: {
          task: "practice_video",
          condition: "observatory",
          filename: "observepractice.mp4",
        },
      },
    },
  };

  // Condition instructions - timed at 45 seconds with approach reminder at top
  var conditionInstructions = {
    neutral: {
      type: HtmlKeyboardResponsePlugin,
      stimulus: `
        <div style="display: flex; align-items: center; justify-content: center; padding: 40px;">
          <div style="font-family: Arial, Helvetica, sans-serif; text-align: center; max-width: 750px; color: black;">
            <p style="font-size: 22px; font-weight: bold; margin-bottom: 30px; color: #2c3e50; background: #e8f4fd; padding: 20px; border-radius: 10px;">
              Now you will watch a series of six videos on your own while applying the <strong>natural</strong> approach.
            </p>
            <h1 style="font-size: 32px; font-weight: bold; margin-bottom: 30px; color: black;">Natural Approach</h1>
            <p style="font-size: 20px; line-height: 1.6; margin-bottom: 40px; color: black;">
              Please watch the video just as you normally would at home. You're in a private space with no cameras or observers.
              Engage with the video in whatever way feels most typical for you. The idea is simply to watch as you would outside
              of a research setting. Enjoy the video as you normally would, as if this were on your own time, in your own space,
              for your own purpose.
            </p>
          </div>
        </div>
      `,
      choices: ["r", "R"],
      trial_duration: 45000,
      data: { task: "condition_instructions", condition: "neutral" },
    },
    observatory: {
      type: HtmlKeyboardResponsePlugin,
      stimulus: `
        <div style="display: flex; align-items: center; justify-content: center; padding: 40px;">
          <div style="font-family: Arial, Helvetica, sans-serif; text-align: center; max-width: 750px; color: black;">
            <p style="font-size: 22px; font-weight: bold; margin-bottom: 30px; color: #2c3e50; background: #e8f4fd; padding: 20px; border-radius: 10px;">
              Now you will watch a series of six videos on your own while applying the <strong>observing</strong> approach.
            </p>
            <h1 style="font-size: 32px; font-weight: bold; margin-bottom: 30px; color: black;">Observing Approach</h1>
            <p style="font-size: 20px; line-height: 1.6; margin-bottom: 40px; color: black;">
              As you watch the video, observe both the scene and your own responses as they happen in the present moment.
              Notice what you see, hear, and feel without trying to change or react. When sensations arise, observe how they
              emerge, shift, and possibly fade or grow stronger. If thoughts or judgments arise, simply acknowledge them and
              continue observing. Simply be present with whatever experience arises, fully aware, nonjudgmental, as each moment passes.
            </p>
          </div>
        </div>
      `,
      choices: ["r", "R"],
      trial_duration: 45000,
      data: { task: "condition_instructions", condition: "observatory" },
    },
    participatory: {
      type: HtmlKeyboardResponsePlugin,
      stimulus: `
        <div style="display: flex; align-items: center; justify-content: center; padding: 40px;">
          <div style="font-family: Arial, Helvetica, sans-serif; text-align: center; max-width: 750px; color: black;">
            <p style="font-size: 22px; font-weight: bold; margin-bottom: 30px; color: #2c3e50; background: #e8f4fd; padding: 20px; border-radius: 10px;">
              Now you will watch a series of six videos on your own while applying the <strong>participating</strong> approach.
            </p>
            <h1 style="font-size: 32px; font-weight: bold; margin-bottom: 30px; color: black;">Participating Approach</h1>
            <p style="font-size: 20px; line-height: 1.6; margin-bottom: 40px; color: black;">
              Let yourself enter the video fully, as if the imagery and sounds are happening not just around you, but within you.
              Allow the scene to draw you in—feeling each moment in your body, letting the rhythm and intensity guide your attention.
              As distractions fade, tune into the sensations that rise and shift, and let them pull you deeper into the experience.
              The more you release the need to observe from a distance, the more naturally you'll become part of what's unfolding.
              Stay with it—fully engaged, fully immersed, moment by moment.
            </p>
          </div>
        </div>
      `,
      choices: ["r", "R"],
      trial_duration: 45000,
      data: { task: "condition_instructions", condition: "participatory" },
    },
  };

  // Break slide - shown after first block
  var break_slide = {
    type: HtmlKeyboardResponsePlugin,
    stimulus: `
      <div style="display: flex; align-items: center; justify-content: center; min-height: 70vh; padding: 40px;">
        <div style="text-align: center; max-width: 700px;">
          <h1 style="font-size: 36px; font-weight: bold; margin-bottom: 30px; color: #2c3e50;">Break Time</h1>
          <div style="background: #e8f4fd; border: 2px solid #3498db; border-radius: 10px; padding: 30px; margin-bottom: 30px;">
            <p style="font-size: 22px; line-height: 1.6; margin: 0; color: #2c3e50;">
              If you would like to use the restroom or take a 5-minute break, you may do so now.
            </p>
          </div>
          <p style="font-size: 20px; line-height: 1.6; color: #333; margin-bottom: 30px;">
            Please pick-up the communication device to let the Research Assistant (RA) know if you would like to take a break or continue on.
          </p>
          <p style="font-size: 18px; color: #c0392b; font-weight: bold;">
            Please remember to avoid using your cellphone during your break.
          </p>
          <p style="font-size: 16px; color: #999; margin-top: 40px; font-style: italic;">
            (RA: Press <strong>N</strong> when the participant is ready to continue)
          </p>
        </div>
      </div>
    `,
    choices: ["n", "N"],
    data: { task: "break_slide" },
  };

  // Add each block
  for (var b = 0; b < blocks.length; b++) {
    var block = blocks[b];

    // Create block-specific versions of the trials with block data and monitor updates
    var blockAudioIntro = Object.assign({}, blockPractice[block.blockType].audio_intro);
    blockAudioIntro.data = Object.assign({}, blockAudioIntro.data, {
      block_type: block.blockType,
      block_order: block.blockOrder,
    });
    blockAudioIntro.on_start = function (trial) {
      sendMonitorUpdate({
        type: "trial_update",
        task: "audio_intro",
        block: {
          order: trial.data.block_order,
          type: trial.data.block_type,
        },
      });
    };

    var blockAudioPlay = Object.assign({}, blockPractice[block.blockType].audio_play);
    blockAudioPlay.data = Object.assign({}, blockAudioPlay.data, {
      block_type: block.blockType,
      block_order: block.blockOrder,
    });
    blockAudioPlay.on_start = function (trial) {
      sendMonitorUpdate({
        type: "trial_update",
        task: "audio_play",
        block: {
          order: trial.data.block_order,
          type: trial.data.block_type,
        },
      });
    };

    var blockRaWait = Object.assign({}, blockPractice[block.blockType].ra_wait);
    blockRaWait.data = Object.assign({}, blockRaWait.data, {
      block_type: block.blockType,
      block_order: block.blockOrder,
    });
    // Update the on_start to include block info
    var originalRaOnStart = blockRaWait.on_start;
    blockRaWait.on_start = function (trial) {
      sendMonitorUpdate({
        type: "ra_needed",
        condition: trial.data.condition,
        instruction: "RA Needed - " + trial.data.condition.charAt(0).toUpperCase() + trial.data.condition.slice(1) + " Block Q&A",
        block: {
          order: trial.data.block_order,
          type: trial.data.block_type,
        },
      });
      sendMonitorUpdate({
        type: "trial_update",
        task: "ra_wait",
        block: {
          order: trial.data.block_order,
          type: trial.data.block_type,
        },
      });
    };

    // Create a function to build the audio + RA Q&A sequence with repeat functionality
    // This uses a loop_function to allow repeating the audio if R is pressed during Q&A
    var audio_ra_procedure = {
      timeline: [
        blockAudioIntro,
        blockAudioPlay,
        blockRaWait,
      ],
      loop_function: function (data) {
        // Check if the last trial (ra_wait) had R pressed
        var lastTrial = data.values()[data.values().length - 1];
        if (lastTrial.response === "r" || lastTrial.response === "R") {
          return true; // Loop back to play audio again
        }
        return false; // Continue to next trial
      },
    };

    // Add practice sequence for this block
    timeline.push({
      type: HtmlKeyboardResponsePlugin,
      stimulus: "",
      choices: "NO_KEYS",
      trial_duration: 100,
      data: { task: "transition" },
    });

    timeline.push(audio_ra_procedure);

    // Add block-specific practice_intro with monitor update
    var blockPracticeIntro = Object.assign({}, blockPractice[block.blockType].practice_intro);
    blockPracticeIntro.data = Object.assign({}, blockPracticeIntro.data, {
      block_type: block.blockType,
      block_order: block.blockOrder,
    });
    blockPracticeIntro.on_start = function (trial) {
      sendMonitorUpdate({
        type: "trial_update",
        task: "practice_intro",
        block: {
          order: trial.data.block_order,
          type: trial.data.block_type,
        },
      });
    };
    timeline.push(blockPracticeIntro);

    // Add block-specific practice_video with monitor update
    var blockPracticeVideo = Object.assign({}, blockPractice[block.blockType].practice_video);
    blockPracticeVideo.data = Object.assign({}, blockPracticeVideo.data, {
      block_type: block.blockType,
      block_order: block.blockOrder,
    });
    blockPracticeVideo.on_start = function (trial) {
      sendMonitorUpdate({
        type: "trial_update",
        task: "practice_video",
        block: {
          order: trial.data.block_order,
          type: trial.data.block_type,
        },
      });
    };
    timeline.push(blockPracticeVideo);

    // Add rating questions after practice video
    timeline.push(rating_procedure);

    // Brief blank screen to clear display before condition instructions
    timeline.push({
      type: HtmlKeyboardResponsePlugin,
      stimulus: "",
      choices: "NO_KEYS",
      trial_duration: 100,
      data: { task: "transition" },
    });

    // Add condition-specific instructions paragraph
    timeline.push(conditionInstructions[block.blockType]);

    // Prepare timeline variables for this block's videos
    var blockVideoStimuli = block.videos.map(function (video, idx) {
      return {
        filepath: [video.filepath],
        filename: video.filename,
        video_type: video.type,
        video_index: video.index,
        trial_in_block: idx + 1,
        block_type: block.blockType,
        block_order: block.blockOrder,
      };
    });

    // Video trial with dial rating - fullscreen with dial overlay
    var video_dial_trial = {
      type: VideoDialRatingPlugin,
      stimulus: jsPsych.timelineVariable("filepath"),
      video_width: "100%",
      video_height: "100%",
      fullscreen: true,
      dial_start: 5,
      sample_rate_ms: 10,
      trial_ends_after_video: true,
      countdown_duration: 10,
      show_trail: false,
      data: {
        task: "video_dial_rating",
        filename: jsPsych.timelineVariable("filename"),
        video_type: jsPsych.timelineVariable("video_type"),
        video_index: jsPsych.timelineVariable("video_index"),
        trial_in_block: jsPsych.timelineVariable("trial_in_block"),
        block_type: jsPsych.timelineVariable("block_type"),
        block_order: jsPsych.timelineVariable("block_order"),
      },
      on_start: function (trial) {
        sendMonitorUpdate({
          type: "trial_update",
          task: "video_dial_rating",
          block: {
            order: trial.data.block_order,
            type: trial.data.block_type,
          },
          video: {
            name: trial.data.filename,
            practice: false,
            trial_in_block: trial.data.trial_in_block,
          },
        });
      },
    };

    // Video procedure for this block (dial video + 4 rating questions)
    var video_procedure = {
      timeline: [video_dial_trial, rating_procedure],
      timeline_variables: blockVideoStimuli,
    };
    console.log(
      "Pushing video_procedure with",
      blockVideoStimuli.length,
      "videos",
    );
    console.log("First video stimulus:", blockVideoStimuli[0]);
    timeline.push(video_procedure);

    // Add break slide after the first block (index 0)
    if (b === 0) {
      timeline.push(break_slide);
    }
  }

  // End screen
  var end_screen = {
    type: HtmlKeyboardResponsePlugin,
    stimulus: "<h1>Experiment Complete</h1><p>Thank you for participating!</p>",
    choices: ["n", "N"],
  };
  timeline.push(end_screen);

  await jsPsych.run(timeline);

  return jsPsych;
}
