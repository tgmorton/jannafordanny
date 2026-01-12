/**
 * @title test
 * @description test
 * @version 2.0.0
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
  const monitorUrl = new URLSearchParams(window.location.search).get('monitor');
  let monitorSocket = null;

  if (monitorUrl) {
    try {
      monitorSocket = new WebSocket(monitorUrl);
      monitorSocket.onopen = () => console.log('Monitor connected:', monitorUrl);
      monitorSocket.onerror = () => {
        console.warn('Monitor connection failed, continuing without monitoring');
        monitorSocket = null;
      };
      monitorSocket.onclose = () => { monitorSocket = null; };
    } catch (e) {
      console.warn('Monitor connection failed:', e.message);
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
    on_finish: function() {
      sendMonitorUpdate({ type: 'session_end' });
      const resultData = jsPsych.data.get().json();
      // Check if JATOS is available
      if (typeof jatos !== 'undefined') {
        jatos.endStudy(resultData);
      } else {
        // Fallback: log data to console when not running in JATOS
        console.log('Experiment complete. Data:', resultData);
      }
    },
    on_data_update: function(data) {
      // Save data incrementally to JATOS after each trial
      if (typeof jatos !== 'undefined' && jatos.submitResultData) {
        jatos.submitResultData(data);
      }
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

  // Helper to generate rating preamble HTML with thermometer
  function ratingPreamble(question, instruction, thermometer) {
    return `
      <div style="display: flex; align-items: center; justify-content: center; min-height: 60vh; padding: 20px; box-sizing: border-box;">
        <div style="display: flex; align-items: center; justify-content: space-between; max-width: 900px; width: 100%; gap: 60px;">
          <div style="flex: 1; text-align: left;">
            <p style="font-size: 28px; font-weight: bold; line-height: 1.4; margin-bottom: 30px; color: #222;">
              ${question}
            </p>
            <p style="font-size: 18px; line-height: 1.6; margin-bottom: 30px; color: #222;">
              ${instruction}
            </p>
          </div>
          <div style="flex-shrink: 0;">
            <img src="${thermometer}" style="height: 450px; width: auto;" alt="Rating scale 0-10">
          </div>
        </div>
      </div>
    `;
  }

  // Helper function to add 0-10 validation to survey-text trials with Numpad Enter support
  function addRatingValidation() {
    var form = document.getElementById("jspsych-survey-text-form");
    var input = form.querySelector('input[type="text"]');
    var submitButton = document.getElementById("jspsych-survey-text-next");

    // Hide the submit button - we'll use Enter key instead
    submitButton.style.display = "none";

    // Add instruction for Enter key
    var enterInstruction = document.createElement("p");
    enterInstruction.style.cssText = "font-size: 16px; color: #666; margin-top: 20px; text-align: center;";
    enterInstruction.textContent = "Press Enter on the numpad to continue.";
    submitButton.parentNode.appendChild(enterInstruction);

    // Add error message container (hidden initially)
    var errorDiv = document.createElement("div");
    errorDiv.id = "rating-error";
    errorDiv.style.cssText =
      "color: #c0392b; font-size: 16px; margin-top: 10px; display: none; text-align: center;";
    errorDiv.textContent = "Please enter a number between 0 and 10.";
    submitButton.parentNode.appendChild(errorDiv);

    // Function to validate and submit
    function validateAndSubmit() {
      var value = parseInt(input.value);
      if (isNaN(value) || value < 0 || value > 10) {
        errorDiv.style.display = "block";
        input.focus();
        return false;
      }
      // Valid - hide error and click submit
      errorDiv.style.display = "none";
      submitButton.click();
      return true;
    }

    // Add Enter key listener (both regular and numpad Enter)
    input.addEventListener("keydown", function(e) {
      // Enter key (code 13) or NumpadEnter
      if (e.key === "Enter" || e.code === "NumpadEnter") {
        e.preventDefault();
        validateAndSubmit();
      }
    });

    // Also allow clicking the button if someone finds it
    submitButton.addEventListener("click", function (e) {
      var value = parseInt(input.value);
      if (isNaN(value) || value < 0 || value > 10) {
        e.preventDefault();
        e.stopImmediatePropagation();
        errorDiv.style.display = "block";
        input.focus();
        return false;
      }
      errorDiv.style.display = "none";
    });
  }

  // Individual rating trials using SurveyTextPlugin with 1-10 validation
  var rating_arousal = {
    type: SurveyTextPlugin,
    preamble: ratingPreamble(
      'During the video, how much <span style="color: #c0392b; font-weight: bold;">sexual arousal</span> (i.e., horny/turned on) did you feel?',
      'Rate your average level of <span style="color: #c0392b; font-weight: bold;">sexual arousal</span> during the video on a scale from 0 to 10 (10 being the highest).',
      "assets/thermometer-red.png",
    ),
    questions: [
      {
        prompt: "Enter a number from 0 to 10:",
        name: "rating",
        required: true,
        columns: 5,
      },
    ],
    button_label: "Continue",
    data: { task: "rating", rating_type: "arousal" },
    on_load: addRatingValidation,
    on_finish: function (data) {
      data.rating = parseInt(data.response.rating);
      sendMonitorUpdate({ type: 'rating_submitted', rating_type: 'arousal', value: data.rating, rt: data.rt });
    },
  };

  var rating_pleasure = {
    type: SurveyTextPlugin,
    preamble: ratingPreamble(
      'During the video, how much <span style="color: #c0392b; font-weight: bold;">sexual pleasure</span> did you feel?',
      'Rate your average level of <span style="color: #c0392b; font-weight: bold;">sexual pleasure</span> during the video on a scale from 0 to 10 (10 being the highest).',
      "assets/thermometer-red.png",
    ),
    questions: [
      {
        prompt: "Enter a number from 0 to 10:",
        name: "rating",
        required: true,
        columns: 5,
      },
    ],
    button_label: "Continue",
    data: { task: "rating", rating_type: "pleasure" },
    on_load: addRatingValidation,
    on_finish: function (data) {
      data.rating = parseInt(data.response.rating);
      sendMonitorUpdate({ type: 'rating_submitted', rating_type: 'pleasure', value: data.rating, rt: data.rt });
    },
  };

  var rating_distraction = {
    type: SurveyTextPlugin,
    preamble: ratingPreamble(
      'During the video, how much <span style="color: #3498db; font-weight: bold;">distraction</span> did you experience?',
      'Rate your average <span style="color: #3498db; font-weight: bold;">distraction</span> level during the video on a scale from 0 to 10 (10 being the highest).',
      "assets/thermometer-blue.png",
    ),
    questions: [
      {
        prompt: "Enter a number from 0 to 10:",
        name: "rating",
        required: true,
        columns: 5,
      },
    ],
    button_label: "Continue",
    data: { task: "rating", rating_type: "distraction" },
    on_load: addRatingValidation,
    on_finish: function (data) {
      data.rating = parseInt(data.response.rating);
      sendMonitorUpdate({ type: 'rating_submitted', rating_type: 'distraction', value: data.rating, rt: data.rt });
    },
  };

  var rating_immersion = {
    type: SurveyTextPlugin,
    preamble: ratingPreamble(
      'During the video, how <span style="color: #c0392b; font-weight: bold;">immersed</span> were you in the present moment?',
      'Rate your average <span style="color: #c0392b; font-weight: bold;">immersion</span> level during the video on a scale from 0 to 10 (10 being the highest).',
      "assets/thermometer-red.png",
    ),
    questions: [
      {
        prompt: "Enter a number from 0 to 10:",
        name: "rating",
        required: true,
        columns: 5,
      },
    ],
    button_label: "Continue",
    data: { task: "rating", rating_type: "immersion" },
    on_load: addRatingValidation,
    on_finish: function (data) {
      data.rating = parseInt(data.response.rating);
      sendMonitorUpdate({ type: 'rating_submitted', rating_type: 'immersion', value: data.rating, rt: data.rt });
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
        type: 'session_start',
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
            Press <strong>N</strong> to continue.
          </p>
        </div>
      </div>
    `,
    choices: ["n", "N"],
    data: { task: "nature_instructions" },
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
                <li><strong>Turn RIGHT</strong> = Your sexual arousal is <strong>increasing</strong></li>
                <li><strong>Turn LEFT</strong> = Your sexual arousal is <strong>decreasing</strong></li>
              </ul>
              <p style="font-size: 16px; margin: 15px 0 0 0; color: #555; line-height: 1.5;">Turn the dial when you notice a change in your sexual arousal, however slight. There is no right or wrong answer. Simply reflect what you are feeling in the moment.</p>
            </div>

            <div style="background: #fff3e0; border-left: 4px solid #ff9800; padding: 18px 22px; margin-bottom: 20px;">
              <p style="font-size: 20px; font-weight: bold; margin: 0 0 10px 0;">Step 3: Set Your Baseline (10 seconds before each video)</p>
              <p style="font-size: 18px; margin: 0; line-height: 1.5;">Before the video starts, you will have <strong>10 seconds</strong> to set the dial to your <strong>current</strong> level of sexual arousal. Use this time to adjust the dial to where you are <strong>right now</strong>.</p>
            </div>

            <p style="font-size: 16px; color: #555; margin-top: 20px; line-height: 1.5;">
              <strong>Try it now!</strong> Turn the dial on the right to see how it responds.
            </p>

            <p style="font-size: 16px; color: #888; margin-top: 15px;">
              Press <strong>N</strong> to continue when ready.
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
    on_load: function() {
      // Make the dial interactive
      var dialPointer = document.getElementById("instruction-dial-pointer");
      var dialValueDisplay = document.getElementById("dial-value-display");
      var currentValue = 5;
      var angleStart = 225;
      var angleEnd = -45;
      var angleRange = angleStart - angleEnd;

      function valueToAngle(value) {
        var normalized = value / 10;
        return angleStart - (normalized * angleRange);
      }

      function updateDial(value) {
        currentValue = Math.max(0, Math.min(10, value));
        var angle = valueToAngle(currentValue);
        var rotation = angle - 90;
        dialPointer.style.transform = "rotate(" + (-rotation) + "deg)";
        dialValueDisplay.textContent = "Current Value: " + Math.round(currentValue * 10) / 10;
      }

      // Track mouse/touch position for dial control
      var handleMove = function(e) {
        var clientY = e.touches ? e.touches[0].clientY : e.clientY;
        var windowHeight = window.innerHeight;
        var margin = windowHeight * 0.3;
        var usableHeight = windowHeight - (margin * 2);

        var newValue;
        if (clientY <= margin) {
          newValue = 10;
        } else if (clientY >= windowHeight - margin) {
          newValue = 0;
        } else {
          var positionInUsable = clientY - margin;
          var normalizedPosition = 1 - (positionInUsable / usableHeight);
          newValue = normalizedPosition * 10;
        }
        updateDial(newValue);
      };

      document.addEventListener("mousemove", handleMove);
      document.addEventListener("touchmove", handleMove, { passive: true });

      // Initialize dial position
      updateDial(5);
    },
    on_start: function() {
      sendMonitorUpdate({ type: 'trial_update', task: 'dial_instructions', instruction: 'Dial Instructions' });
    },
    on_finish: function(data) {
      sendMonitorUpdate({ type: 'instruction_complete', task: 'dial_instructions', instruction: 'Dial Instructions', rt: data.rt });
    }
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
            Press <strong>N</strong> when you are ready to begin.
          </p>
        </div>
      </div>
    `,
    choices: ["n", "N"],
    data: { task: "study_overview" },
    on_start: function() {
      sendMonitorUpdate({ type: 'trial_update', task: 'study_overview', instruction: 'Study Overview' });
    },
    on_finish: function(data) {
      sendMonitorUpdate({ type: 'instruction_complete', task: 'study_overview', instruction: 'Study Overview', rt: data.rt });
    }
  };

  // Nature video with dial rating (replaces simple video playback)
  var nature_video_dial = {
    type: VideoDialRatingPlugin,
    stimulus: ["assets/nature.mp4"],
    video_width: 960,
    video_height: 540,
    dial_start: 5,
    sample_rate_ms: 10,
    trial_ends_after_video: true,
    countdown_duration: 10,
    show_trail: false,
    data: {
      task: "nature_video_dial",
      filename: "nature.mp4",
    },
    on_start: function() {
      sendMonitorUpdate({ type: 'trial_update', task: 'nature_video_dial' });
    }
  };

  // Audio test slide - plays a short audio to test headphones
  var audio_test = {
    type: HtmlKeyboardResponsePlugin,
    stimulus: `
      <div style="display: flex; align-items: center; justify-content: center; min-height: 70vh; padding: 40px;">
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
          <p style="font-size: 18px; color: #555; margin-bottom: 20px;">
            If you can hear the audio clearly, press <strong>N</strong> to continue to the dial test.
          </p>
          <p style="font-size: 16px; color: #999; font-style: italic;">
            (RA: If there are audio issues, please assist the participant before continuing)
          </p>
        </div>
      </div>
    `,
    choices: ["n", "N"],
    data: { task: "audio_test" },
    on_load: function() {
      // Stop audio when trial ends
      var audio = document.getElementById("test-audio");
      if (audio) {
        audio.volume = 0.5; // Set moderate default volume
      }
    }
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
            <p style="font-size: 18px; color: #555; margin-bottom: 30px;">
              When you are comfortable with how the dial works, press <strong>N</strong> to continue.
            </p>
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
    on_load: function() {
      // Make the dial interactive
      var dialPointer = document.getElementById("test-dial-pointer");
      var dialValueDisplay = document.getElementById("test-dial-value");
      var currentValue = 5;
      var angleStart = 225;
      var angleEnd = -45;
      var angleRange = angleStart - angleEnd;

      function valueToAngle(value) {
        var normalized = value / 10;
        return angleStart - (normalized * angleRange);
      }

      function updateDial(value) {
        currentValue = Math.max(0, Math.min(10, value));
        var angle = valueToAngle(currentValue);
        var rotation = angle - 90;
        dialPointer.style.transform = "rotate(" + (-rotation) + "deg)";
        dialValueDisplay.textContent = "Current Value: " + Math.round(currentValue * 10) / 10;
      }

      // Track mouse/touch position for dial control
      var handleMove = function(e) {
        var clientY = e.touches ? e.touches[0].clientY : e.clientY;
        var windowHeight = window.innerHeight;
        var margin = windowHeight * 0.3;
        var usableHeight = windowHeight - (margin * 2);

        var newValue;
        if (clientY <= margin) {
          newValue = 10;
        } else if (clientY >= windowHeight - margin) {
          newValue = 0;
        } else {
          var positionInUsable = clientY - margin;
          var normalizedPosition = 1 - (positionInUsable / usableHeight);
          newValue = normalizedPosition * 10;
        }
        updateDial(newValue);
      };

      document.addEventListener("mousemove", handleMove);
      document.addEventListener("touchmove", handleMove, { passive: true });

      // Initialize dial position
      updateDial(5);
    }
  };

  // Build timeline - removed fullscreen entry, now starts with preload and equipment tests
  timeline.push(preload);
  timeline.push(audio_test);
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

  // Add dial instructions BEFORE nature video so participants know how to use it
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

  // SRT parsing and karaoke-style subtitle display helper functions
  function parseSRT(srtText) {
    var subtitles = [];
    var blocks = srtText.trim().split(/\n\n+/);
    for (var i = 0; i < blocks.length; i++) {
      var lines = blocks[i].split("\n");
      if (lines.length >= 3) {
        var timeMatch = lines[1].match(
          /(\d{2}):(\d{2}):(\d{2}),(\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2}),(\d{3})/,
        );
        if (timeMatch) {
          var startMs =
            parseInt(timeMatch[1]) * 3600000 +
            parseInt(timeMatch[2]) * 60000 +
            parseInt(timeMatch[3]) * 1000 +
            parseInt(timeMatch[4]);
          var endMs =
            parseInt(timeMatch[5]) * 3600000 +
            parseInt(timeMatch[6]) * 60000 +
            parseInt(timeMatch[7]) * 1000 +
            parseInt(timeMatch[8]);
          var text = lines.slice(2).join(" ");
          subtitles.push({ start: startMs, end: endMs, text: text });
        }
      }
    }
    return subtitles;
  }

  // Karaoke-style subtitle display - shows blocks of text with current portion highlighted
  function setupKaraokeSubtitles(audioElement, subtitles, subtitleElement) {
    var currentIndex = -1;
    var CONTEXT_SIZE = 3; // Number of subtitles to show before and after current

    function renderKaraokeText(currentIdx, subtitles) {
      if (currentIdx < 0 || currentIdx >= subtitles.length) {
        return "";
      }

      // Calculate range of subtitles to display
      var startIdx = Math.max(0, currentIdx - CONTEXT_SIZE);
      var endIdx = Math.min(subtitles.length - 1, currentIdx + CONTEXT_SIZE);

      var html = "";
      for (var i = startIdx; i <= endIdx; i++) {
        var text = subtitles[i].text;
        if (i === currentIdx) {
          // Current subtitle - highlighted
          html += '<span style="background-color: #ffeb3b; color: #000; padding: 2px 6px; border-radius: 4px; font-weight: bold;">' + text + '</span> ';
        } else if (i < currentIdx) {
          // Past subtitles - dimmed
          html += '<span style="color: #888;">' + text + '</span> ';
        } else {
          // Future subtitles - normal but slightly dimmed
          html += '<span style="color: #555;">' + text + '</span> ';
        }
      }
      return html;
    }

    audioElement.addEventListener("timeupdate", function () {
      var currentTime = audioElement.currentTime * 1000;
      var found = false;

      for (var i = 0; i < subtitles.length; i++) {
        if (currentTime >= subtitles[i].start && currentTime <= subtitles[i].end) {
          if (currentIndex !== i) {
            subtitleElement.innerHTML = renderKaraokeText(i, subtitles);
            currentIndex = i;
          }
          found = true;
          break;
        }
      }

      // If between subtitles, show the last displayed block
      if (!found && currentIndex >= 0) {
        // Find the next subtitle
        for (var j = 0; j < subtitles.length; j++) {
          if (currentTime < subtitles[j].start) {
            // We're between currentIndex and j, keep showing current context
            break;
          }
        }
      }
    });

    // Initialize with first few subtitles
    if (subtitles.length > 0) {
      subtitleElement.innerHTML = renderKaraokeText(0, subtitles);
    }
  }

  // Legacy function for backwards compatibility
  function setupSubtitles(audioElement, subtitles, subtitleElement) {
    setupKaraokeSubtitles(audioElement, subtitles, subtitleElement);
  }

  // Block practice components for each condition
  // Helper to get display name for condition
  function getConditionDisplayName(condition) {
    var names = {
      neutral: "Natural",
      participatory: "Participating",
      observatory: "Observing"
    };
    return names[condition] || condition;
  }

  // Store audio file paths for repeat functionality
  var audioFiles = {
    neutral: "assets/natural.mp3",
    participatory: "assets/participate.mp3",
    observatory: "assets/observe.mp3"
  };

  var srtFiles = {
    neutral: "assets/natural.mp3.srt",
    participatory: "assets/participate.mp3.srt",
    observatory: "assets/observe.mp3.srt"
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
                Press <strong>N</strong> to continue.
              </p>
            </div>
          </div>
        `,
        choices: ["n", "N"],
        data: { task: "audio_intro", condition: "neutral" },
      },
      audio_play: {
        type: HtmlKeyboardResponsePlugin,
        stimulus: `
          <audio id="audio-instruction" autoplay><source src="assets/natural.mp3" type="audio/mpeg"></audio>
          <div style="display: flex; align-items: center; justify-content: center; min-height: 50vh; flex-direction: column;">
            <h2 style="font-size: 28px; text-align: center; color: #333; margin-bottom: 30px;">Natural Instructions Now Playing</h2>
            <div id="subtitle-display" style="font-size: 20px; text-align: center; max-width: 900px; line-height: 1.8; min-height: 120px; padding: 20px; background: #f9f9f9; border-radius: 10px;"></div>
          </div>
        `,
        choices: ["n", "N"],
        on_load: function () {
          lastAudioCondition = "neutral";
          var audio = document.getElementById("audio-instruction");
          var subtitleEl = document.getElementById("subtitle-display");
          fetch("assets/natural.mp3.srt")
            .then(function (response) {
              return response.text();
            })
            .then(function (srtText) {
              var subtitles = parseSRT(srtText);
              setupKaraokeSubtitles(audio, subtitles, subtitleEl);
            });
          audio.addEventListener("ended", function () {
            jsPsych.finishTrial();
          });
        },
        data: { task: "audio_play", condition: "neutral" },
      },
      ra_wait: {
        type: HtmlKeyboardResponsePlugin,
        stimulus: `
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
                (RA: Press <strong>N</strong> when the Q&A session is complete, or press <strong>R</strong> to repeat the audio instructions)
              </p>
            </div>
          </div>
        `,
        choices: ["n", "N", "r", "R"],
        data: { task: "ra_wait", condition: "neutral" },
        on_finish: function(data) {
          // Check if R was pressed to repeat audio
          if (data.response === "r" || data.response === "R") {
            data.repeat_audio = true;
          }
        }
      },
      practice_intro: {
        type: HtmlKeyboardResponsePlugin,
        stimulus:
          '<div style="display: flex; align-items: center; justify-content: center; min-height: 50vh;"><p style="font-size: 20px; text-align: center;">You will now apply the approach you learned onto a guided video.<br><br><span style="color: #888; font-size: 16px;">Press <strong>N</strong> to continue.</span></p></div>',
        choices: ["n", "N"],
        trial_duration: 5000,
        data: { task: "practice_intro", condition: "neutral" },
      },
      practice_video: {
        type: VideoKeyboardResponsePlugin,
        stimulus: ["assets/naturalpractice.mp4"],
        choices: ["n", "N"],
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
                Press <strong>N</strong> to continue.
              </p>
            </div>
          </div>
        `,
        choices: ["n", "N"],
        data: { task: "audio_intro", condition: "participatory" },
      },
      audio_play: {
        type: HtmlKeyboardResponsePlugin,
        stimulus: `
          <audio id="audio-instruction" autoplay><source src="assets/participate.mp3" type="audio/mpeg"></audio>
          <div style="display: flex; align-items: center; justify-content: center; min-height: 50vh; flex-direction: column;">
            <h2 style="font-size: 28px; text-align: center; color: #333; margin-bottom: 30px;">Participating Instructions Now Playing</h2>
            <div id="subtitle-display" style="font-size: 20px; text-align: center; max-width: 900px; line-height: 1.8; min-height: 120px; padding: 20px; background: #f9f9f9; border-radius: 10px;"></div>
          </div>
        `,
        choices: ["n", "N"],
        on_load: function () {
          lastAudioCondition = "participatory";
          var audio = document.getElementById("audio-instruction");
          var subtitleEl = document.getElementById("subtitle-display");
          fetch("assets/participate.mp3.srt")
            .then(function (response) {
              return response.text();
            })
            .then(function (srtText) {
              var subtitles = parseSRT(srtText);
              setupKaraokeSubtitles(audio, subtitles, subtitleEl);
            });
          audio.addEventListener("ended", function () {
            jsPsych.finishTrial();
          });
        },
        data: { task: "audio_play", condition: "participatory" },
      },
      ra_wait: {
        type: HtmlKeyboardResponsePlugin,
        stimulus: `
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
                (RA: Press <strong>N</strong> when the Q&A session is complete, or press <strong>R</strong> to repeat the audio instructions)
              </p>
            </div>
          </div>
        `,
        choices: ["n", "N", "r", "R"],
        data: { task: "ra_wait", condition: "participatory" },
        on_finish: function(data) {
          if (data.response === "r" || data.response === "R") {
            data.repeat_audio = true;
          }
        }
      },
      practice_intro: {
        type: HtmlKeyboardResponsePlugin,
        stimulus:
          '<div style="display: flex; align-items: center; justify-content: center; min-height: 50vh;"><p style="font-size: 20px; text-align: center;">You will now apply the approach you learned onto a guided video.<br><br><span style="color: #888; font-size: 16px;">Press <strong>N</strong> to continue.</span></p></div>',
        choices: ["n", "N"],
        trial_duration: 5000,
        data: { task: "practice_intro", condition: "participatory" },
      },
      practice_video: {
        type: VideoKeyboardResponsePlugin,
        stimulus: ["assets/participatepractice.mp4"],
        choices: ["n", "N"],
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
                Press <strong>N</strong> to continue.
              </p>
            </div>
          </div>
        `,
        choices: ["n", "N"],
        data: { task: "audio_intro", condition: "observatory" },
      },
      audio_play: {
        type: HtmlKeyboardResponsePlugin,
        stimulus: `
          <audio id="audio-instruction" autoplay><source src="assets/observe.mp3" type="audio/mpeg"></audio>
          <div style="display: flex; align-items: center; justify-content: center; min-height: 50vh; flex-direction: column;">
            <h2 style="font-size: 28px; text-align: center; color: #333; margin-bottom: 30px;">Observing Instructions Now Playing</h2>
            <div id="subtitle-display" style="font-size: 20px; text-align: center; max-width: 900px; line-height: 1.8; min-height: 120px; padding: 20px; background: #f9f9f9; border-radius: 10px;"></div>
          </div>
        `,
        choices: ["n", "N"],
        on_load: function () {
          lastAudioCondition = "observatory";
          var audio = document.getElementById("audio-instruction");
          var subtitleEl = document.getElementById("subtitle-display");
          fetch("assets/observe.mp3.srt")
            .then(function (response) {
              return response.text();
            })
            .then(function (srtText) {
              var subtitles = parseSRT(srtText);
              setupKaraokeSubtitles(audio, subtitles, subtitleEl);
            });
          audio.addEventListener("ended", function () {
            jsPsych.finishTrial();
          });
        },
        data: { task: "audio_play", condition: "observatory" },
      },
      ra_wait: {
        type: HtmlKeyboardResponsePlugin,
        stimulus: `
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
                (RA: Press <strong>N</strong> when the Q&A session is complete, or press <strong>R</strong> to repeat the audio instructions)
              </p>
            </div>
          </div>
        `,
        choices: ["n", "N", "r", "R"],
        data: { task: "ra_wait", condition: "observatory" },
        on_finish: function(data) {
          if (data.response === "r" || data.response === "R") {
            data.repeat_audio = true;
          }
        }
      },
      practice_intro: {
        type: HtmlKeyboardResponsePlugin,
        stimulus:
          '<div style="display: flex; align-items: center; justify-content: center; min-height: 50vh;"><p style="font-size: 20px; text-align: center;">You will now apply the approach you learned onto a guided video.<br><br><span style="color: #888; font-size: 16px;">Press <strong>N</strong> to continue.</span></p></div>',
        choices: ["n", "N"],
        trial_duration: 5000,
        data: { task: "practice_intro", condition: "observatory" },
      },
      practice_video: {
        type: VideoKeyboardResponsePlugin,
        stimulus: ["assets/observepractice.mp4"],
        choices: ["n", "N"],
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
      choices: "NO_KEYS",
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
      choices: "NO_KEYS",
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
      choices: "NO_KEYS",
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

    // Create a function to build the audio + RA Q&A sequence with repeat functionality
    // This uses a loop_function to allow repeating the audio if R is pressed during Q&A
    var audio_ra_procedure = {
      timeline: [
        blockPractice[block.blockType].audio_intro,
        blockPractice[block.blockType].audio_play,
        blockPractice[block.blockType].ra_wait
      ],
      loop_function: function(data) {
        // Check if the last trial (ra_wait) had R pressed
        var lastTrial = data.values()[data.values().length - 1];
        if (lastTrial.response === "r" || lastTrial.response === "R") {
          return true; // Loop back to play audio again
        }
        return false; // Continue to next trial
      }
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
    timeline.push(blockPractice[block.blockType].practice_intro);
    timeline.push(blockPractice[block.blockType].practice_video);

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
      on_start: function() {
        sendMonitorUpdate({
          type: 'trial_update',
          task: 'video_dial_rating',
          block: {
            order: jsPsych.evaluateTimelineVariable('block_order'),
            type: jsPsych.evaluateTimelineVariable('block_type'),
          },
          video: {
            name: jsPsych.evaluateTimelineVariable('filename'),
            practice: false,
            trial_in_block: jsPsych.evaluateTimelineVariable('trial_in_block'),
          },
        });
      }
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
