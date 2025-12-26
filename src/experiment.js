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
  const jsPsych = initJsPsych();

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
      <div style="display: flex; align-items: center; justify-content: center; min-height: 60vh; padding: 20px; box-sizing: border-box; background: white;">
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

  // Helper function to add 0-10 validation to survey-text trials
  function addRatingValidation() {
    var form = document.getElementById("jspsych-survey-text-form");
    var input = form.querySelector('input[type="text"]');
    var submitButton = document.getElementById("jspsych-survey-text-next");

    // Add error message container (hidden initially)
    var errorDiv = document.createElement("div");
    errorDiv.id = "rating-error";
    errorDiv.style.cssText =
      "color: #c0392b; font-size: 16px; margin-top: 10px; display: none; text-align: center;";
    errorDiv.textContent = "Please enter a number between 0 and 10.";
    submitButton.parentNode.appendChild(errorDiv);

    // Replace the button with a clone to remove any existing listeners
    var newButton = submitButton.cloneNode(true);
    submitButton.parentNode.replaceChild(newButton, submitButton);

    // Add validation to the new button
    newButton.addEventListener("click", function (e) {
      var value = parseInt(input.value);
      if (isNaN(value) || value < 0 || value > 10) {
        e.preventDefault();
        e.stopImmediatePropagation();
        errorDiv.style.display = "block";
        input.focus();
        return false;
      }
      // Valid - hide error and let it proceed
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

    // Add error message container (hidden initially)
    var errorDiv = document.createElement("div");
    errorDiv.id = "pid-error";
    errorDiv.style.cssText =
      "color: #c0392b; font-size: 16px; margin-top: 10px; display: none; text-align: center;";
    errorDiv.textContent =
      'Please enter exactly 8 digits (without the "A" prefix).';
    submitButton.parentNode.appendChild(errorDiv);

    // Intercept button click before form submission
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
          '<p style="font-size: 20px;">Enter your 8-digit Participant ID (without the "A"):</p><p style="font-size: 14px; color: #666;">Example: If your ID is A12345678, enter 12345678</p>',
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
    },
  };

  // PID confirmation - separate page
  var pid_confirmation = {
    type: HtmlButtonResponsePlugin,
    stimulus: function () {
      return `<p style="font-size: 20px; text-align: center; margin-bottom: 20px;">Please confirm that this PID is correct: ${entered_pid}</p>`;
    },
    choices: ["Yes", "No"],
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
      // If they clicked "No" (button index 1), loop again
      if (last_trial.response === 1) {
        return true; // Loop again - go back to PID entry
      } else {
        return false; // Continue to experiment
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
    type: HtmlButtonResponsePlugin,
    stimulus: `
      <div style="display: flex; align-items: center; justify-content: center; padding: 40px;">
        <p style="font-size: 20px; line-height: 1.6; text-align: center; max-width: 750px;">
          You will now watch a nature video. Take this moment to get comfortable, relax your shoulders, breathe normally, and simply watch the video.
        </p>
      </div>
    `,
    choices: ["Continue"],
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

  // Dial instructions screen - shown before blocks begin
  var dial_instructions = {
    type: HtmlButtonResponsePlugin,
    stimulus: `
      <div style="display: flex; align-items: center; justify-content: center; padding: 40px;">
        <div style="display: flex; align-items: center; gap: 60px; max-width: 1100px;">
          <div style="flex: 1; text-align: left;">
            <h1 style="font-size: 28px; font-weight: bold; margin-bottom: 35px;">Sexual Arousal Dial Instructions</h1>

            <div style="background: #f8f8f8; border-left: 4px solid #c0392b; padding: 15px 20px; margin-bottom: 18px;">
              <p style="font-size: 18px; margin: 0 0 8px 0;"><strong>1. Before the video</strong> <span style="color: #666;">(10 seconds)</span></p>
              <p style="font-size: 18px; margin: 0;">Set the dial to your current level of <strong>sexual arousal</strong>.</p>
            </div>

            <div style="background: #f8f8f8; border-left: 4px solid #c0392b; padding: 15px 20px; margin-bottom: 18px;">
              <p style="font-size: 18px; margin: 0 0 8px 0;"><strong>2. During the video</strong></p>
              <p style="font-size: 18px; margin: 0 0 10px 0;">Move your finger <strong>UP</strong> or <strong>DOWN</strong> on the trackpad as your <strong>sexual arousal</strong> changes.</p>
              <p style="font-size: 16px; margin: 0; color: #555;">Up = more <strong>sexual arousal</strong> · Down = less <strong>sexual arousal</strong></p>
            </div>

            <div style="background: #f8f8f8; border-left: 4px solid #c0392b; padding: 15px 20px; margin-bottom: 18px;">
              <p style="font-size: 18px; margin: 0 0 8px 0;"><strong>3. Scale</strong></p>
              <p style="font-size: 18px; margin: 0;">0 (<strong>no</strong> sexual arousal) → 10 (the <strong>highest</strong> sexual arousal)</p>
            </div>

            <p style="font-size: 14px; color: #888; margin-top: 25px;">
              Note: Your cursor will be hidden during playback.
            </p>
          </div>
          <div style="flex-shrink: 0;">
            <img src="assets/dial.svg" style="width: 250px; height: 250px;" alt="Arousal dial rating scale">
          </div>
        </div>
      </div>
    `,
    choices: ["Continue"],
    data: { task: "dial_instructions" },
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

  // Build timeline
  timeline.push(enter_fullscreen);
  timeline.push(preload);
  timeline.push(pid_loop);
  //timeline.push(welcome);
  timeline.push({
    type: HtmlKeyboardResponsePlugin,
    stimulus: "",
    choices: "NO_KEYS",
    trial_duration: 100,
    data: { task: "transition" },
  });
  timeline.push(nature_instructions);
  timeline.push(nature_video);

  // Add rating questions after nature video
  timeline.push(rating_procedure);

  // Brief blank screen to clear display before dial instructions
  var pre_dial_transition = {
    type: HtmlKeyboardResponsePlugin,
    stimulus: "",
    choices: "NO_KEYS",
    trial_duration: 100,
    data: { task: "transition" },
  };
  timeline.push(pre_dial_transition);

  // Add dial instructions before blocks begin
  timeline.push(dial_instructions);

  // SRT parsing and subtitle display helper functions
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

  function setupSubtitles(audioElement, subtitles, subtitleElement) {
    var currentIndex = -1;
    audioElement.addEventListener("timeupdate", function () {
      var currentTime = audioElement.currentTime * 1000;
      var found = false;
      for (var i = 0; i < subtitles.length; i++) {
        if (
          currentTime >= subtitles[i].start &&
          currentTime <= subtitles[i].end
        ) {
          if (currentIndex !== i) {
            subtitleElement.textContent = subtitles[i].text;
            currentIndex = i;
          }
          found = true;
          break;
        }
      }
      if (!found && currentIndex !== -1) {
        subtitleElement.textContent = "";
        currentIndex = -1;
      }
    });
  }

  // Block practice components for each condition
  var blockPractice = {
    neutral: {
      audio_intro: {
        type: HtmlButtonResponsePlugin,
        stimulus:
          '<div style="display: flex; align-items: center; justify-content: center; padding: 40px;"><p style="font-size: 20px; text-align: center;">You will now listen to audio instructions that will teach you how to apply a natural approach.</p></div>',
        choices: ["Continue"],
        data: { task: "audio_intro", condition: "neutral" },
      },
      audio_play: {
        type: HtmlKeyboardResponsePlugin,
        stimulus: `
          <audio id="audio-instruction" autoplay><source src="assets/natural.mp3" type="audio/mpeg"></audio>
          <div style="display: flex; align-items: center; justify-content: center; min-height: 50vh; flex-direction: column;">
            <p style="font-size: 16px; text-align: center; color: #666; margin-bottom: 20px;">Audio instructions in progress...</p>
            <p id="subtitle-display" style="font-size: 22px; text-align: center; max-width: 800px; line-height: 1.6; min-height: 60px;"></p>
          </div>
        `,
        choices: ["n", "N"],
        on_load: function () {
          var audio = document.getElementById("audio-instruction");
          var subtitleEl = document.getElementById("subtitle-display");
          fetch("assets/natural.mp3.srt")
            .then(function (response) {
              return response.text();
            })
            .then(function (srtText) {
              var subtitles = parseSRT(srtText);
              setupSubtitles(audio, subtitles, subtitleEl);
            });
          audio.addEventListener("ended", function () {
            jsPsych.finishTrial();
          });
        },
        data: { task: "audio_play", condition: "neutral" },
      },
      practice_intro: {
        type: HtmlKeyboardResponsePlugin,
        stimulus:
          '<div style="display: flex; align-items: center; justify-content: center; min-height: 50vh;"><p style="font-size: 20px; text-align: center;">You will now apply the approach you learned onto a guided video.</p></div>',
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
        type: HtmlButtonResponsePlugin,
        stimulus:
          '<div style="display: flex; align-items: center; justify-content: center; padding: 40px;"><p style="font-size: 20px; text-align: center;">You will now listen to audio instructions that will teach you how to apply a participating approach.</p></div>',
        choices: ["Continue"],
        data: { task: "audio_intro", condition: "participatory" },
      },
      audio_play: {
        type: HtmlKeyboardResponsePlugin,
        stimulus: `
          <audio id="audio-instruction" autoplay><source src="assets/participate.mp3" type="audio/mpeg"></audio>
          <div style="display: flex; align-items: center; justify-content: center; min-height: 50vh; flex-direction: column;">
            <p style="font-size: 16px; text-align: center; color: #666; margin-bottom: 20px;">Audio instructions in progress...</p>
            <p id="subtitle-display" style="font-size: 22px; text-align: center; max-width: 800px; line-height: 1.6; min-height: 60px;"></p>
          </div>
        `,
        choices: ["n", "N"],
        on_load: function () {
          var audio = document.getElementById("audio-instruction");
          var subtitleEl = document.getElementById("subtitle-display");
          fetch("assets/participate.mp3.srt")
            .then(function (response) {
              return response.text();
            })
            .then(function (srtText) {
              var subtitles = parseSRT(srtText);
              setupSubtitles(audio, subtitles, subtitleEl);
            });
          audio.addEventListener("ended", function () {
            jsPsych.finishTrial();
          });
        },
        data: { task: "audio_play", condition: "participatory" },
      },
      practice_intro: {
        type: HtmlKeyboardResponsePlugin,
        stimulus:
          '<div style="display: flex; align-items: center; justify-content: center; min-height: 50vh;"><p style="font-size: 20px; text-align: center;">You will now apply the approach you learned onto a guided video.</p></div>',
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
        type: HtmlButtonResponsePlugin,
        stimulus:
          '<div style="display: flex; align-items: center; justify-content: center; padding: 40px;"><p style="font-size: 20px; text-align: center;">You will now listen to audio instructions that will teach you how to apply an observing approach.</p></div>',
        choices: ["Continue"],
        data: { task: "audio_intro", condition: "observatory" },
      },
      audio_play: {
        type: HtmlKeyboardResponsePlugin,
        stimulus: `
          <audio id="audio-instruction" autoplay><source src="assets/observe.mp3" type="audio/mpeg"></audio>
          <div style="display: flex; align-items: center; justify-content: center; min-height: 50vh; flex-direction: column;">
            <p style="font-size: 16px; text-align: center; color: #666; margin-bottom: 20px;">Audio instructions in progress...</p>
            <p id="subtitle-display" style="font-size: 22px; text-align: center; max-width: 800px; line-height: 1.6; min-height: 60px;"></p>
          </div>
        `,
        choices: ["n", "N"],
        on_load: function () {
          var audio = document.getElementById("audio-instruction");
          var subtitleEl = document.getElementById("subtitle-display");
          fetch("assets/observe.mp3.srt")
            .then(function (response) {
              return response.text();
            })
            .then(function (srtText) {
              var subtitles = parseSRT(srtText);
              setupSubtitles(audio, subtitles, subtitleEl);
            });
          audio.addEventListener("ended", function () {
            jsPsych.finishTrial();
          });
        },
        data: { task: "audio_play", condition: "observatory" },
      },
      practice_intro: {
        type: HtmlKeyboardResponsePlugin,
        stimulus:
          '<div style="display: flex; align-items: center; justify-content: center; min-height: 50vh;"><p style="font-size: 20px; text-align: center;">You will now apply the approach you learned onto a guided video.</p></div>',
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

  // Condition instructions
  var conditionInstructions = {
    neutral: {
      type: HtmlButtonResponsePlugin,
      stimulus: `
        <div style="background-color: white; display: flex; align-items: center; justify-content: center; padding: 40px;">
          <div style="font-family: Arial, Helvetica, sans-serif; text-align: center; max-width: 750px; color: black;">
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
      choices: ["Continue"],
      data: { task: "condition_instructions", condition: "neutral" },
    },
    observatory: {
      type: HtmlButtonResponsePlugin,
      stimulus: `
        <div style="background-color: white; display: flex; align-items: center; justify-content: center; padding: 40px;">
          <div style="font-family: Arial, Helvetica, sans-serif; text-align: center; max-width: 750px; color: black;">
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
      choices: ["Continue"],
      data: { task: "condition_instructions", condition: "observatory" },
    },
    participatory: {
      type: HtmlButtonResponsePlugin,
      stimulus: `
        <div style="background-color: white; display: flex; align-items: center; justify-content: center; padding: 40px;">
          <div style="font-family: Arial, Helvetica, sans-serif; text-align: center; max-width: 750px; color: black;">
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
      choices: ["Continue"],
      data: { task: "condition_instructions", condition: "participatory" },
    },
  };

  // Add each block
  for (var b = 0; b < blocks.length; b++) {
    var block = blocks[b];

    // Add practice sequence for this block
    timeline.push({
      type: HtmlKeyboardResponsePlugin,
      stimulus: "",
      choices: "NO_KEYS",
      trial_duration: 100,
      data: { task: "transition" },
    });
    timeline.push(blockPractice[block.blockType].audio_intro);
    timeline.push(blockPractice[block.blockType].audio_play);
    timeline.push(blockPractice[block.blockType].practice_intro);
    timeline.push(blockPractice[block.blockType].practice_video);

    // Add rating questions after practice video
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

    // Video trial with dial rating
    var video_dial_trial = {
      type: VideoDialRatingPlugin,
      stimulus: jsPsych.timelineVariable("filepath"),
      video_width: 960,
      video_height: 540,
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
