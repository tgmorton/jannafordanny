/**
 * @title Video Arousal Rating Experiment
 * @description jsPsych experiment for measuring arousal responses to video stimuli
 * @version 0.2.0
 *
 * @assets assets/
 */

import "../styles/main.scss";

import HtmlKeyboardResponsePlugin from "@jspsych/plugin-html-keyboard-response";
import VideoKeyboardResponsePlugin from "@jspsych/plugin-video-keyboard-response";
import SurveyLikertPlugin from "@jspsych/plugin-survey-likert";
import PreloadPlugin from "@jspsych/plugin-preload";
import { initJsPsych } from "jspsych";

// Import custom video arousal rating plugin
import VideoArousalRatingPlugin from "./plugins/plugin-video-arousal-rating.js";

export async function run({ assetPaths, input = {}, environment, title, version }) {
  const jsPsych = initJsPsych();

  const timeline = [];

  // Load videos from JSON
  async function loadJSON(filepath) {
    const response = await fetch(filepath);
    const data = await response.json();
    return data;
  }

  var allVideos = await loadJSON('assets/videos_mov.json');

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

  // Randomize videos and block order
  var shuffledVideos = shuffle(allVideos);
  var shuffledBlockTypes = shuffle(blockTypes);

  // Create blocks: each block gets 6 videos
  var blocks = shuffledBlockTypes.map(function(blockType, idx) {
    return {
      blockType: blockType,
      blockOrder: idx + 1,
      videos: shuffledVideos.slice(idx * 6, (idx + 1) * 6)
    };
  });

  console.log("Randomized blocks:", blocks);

  // Preload assets
  var preload = {
    type: PreloadPlugin,
    video: assetPaths.video,
  };

  // Welcome screen
  var welcome = {
    type: HtmlKeyboardResponsePlugin,
    stimulus: "<h1>Welcome to the Experiment</h1><p>Press any key to start</p>",
  };

  // Instructions for practice trial
  var practice_instructions = {
    type: HtmlKeyboardResponsePlugin,
    stimulus: `
      <h2>Practice Trial</h2>
      <p>Before we begin, you will complete a practice trial to learn how the rating system works.</p>
      <p>You will use your <strong>trackpad</strong> to continuously rate your arousal level while watching a video.</p>
      <p>Move your finger <strong>up</strong> on the trackpad for higher arousal (more excited/stimulated).</p>
      <p>Move your finger <strong>down</strong> on the trackpad for lower arousal (more calm/relaxed).</p>
      <br>
      <p>Press any key to begin the practice trial.</p>
    `,
    data: { task: 'practice_instructions' }
  };

  // Practice trial with trackpad-based continuous arousal rating
  var practice_trial = {
    type: VideoArousalRatingPlugin,
    stimulus: ['assets/ff1.mov'],  // Use first video as practice
    input_mode: 'trackpad',
    video_width: 640,
    video_height: 480,
    slider_start: 5,
    slider_labels: ['0 (Calm)', '10 (Excited)'],
    sample_rate_ms: 100,
    trail_enabled: true,
    trail_color: 'rgba(70, 130, 180, 0.8)',
    trial_ends_after_video: true,
    centering_duration: 5,  // Shorter countdown for practice
    prompt: '<p>Practice: Move your finger on the trackpad to rate your arousal</p>',
    data: {
      task: 'practice_video',
      filename: 'ff1.mov'
    }
  };

  // Practice feedback
  var practice_feedback = {
    type: HtmlKeyboardResponsePlugin,
    stimulus: `
      <h2>Practice Complete!</h2>
      <p>Great job! You've completed the practice trial.</p>
      <p>Now you will begin the main experiment with 3 blocks of 6 videos each.</p>
      <p>After each video, you will also rate your arousal on a scale.</p>
      <br>
      <p>Press any key to begin the experiment.</p>
    `,
    data: { task: 'practice_feedback' }
  };

  // Build timeline
  timeline.push(preload);
  timeline.push(welcome);
  timeline.push(practice_instructions);
  timeline.push(practice_trial);
  timeline.push(practice_feedback);

  // Add each block
  for (var b = 0; b < blocks.length; b++) {
    var block = blocks[b];

    // Block intro
    var block_intro = {
      type: HtmlKeyboardResponsePlugin,
      stimulus: `<h2>Block ${block.blockOrder}: ${block.blockType.toUpperCase()}</h2>
                 <p>This block contains 6 videos.</p>
                 <p>Press any key to begin.</p>`,
      data: {
        task: 'block_intro',
        block_type: block.blockType,
        block_order: block.blockOrder
      }
    };
    timeline.push(block_intro);

    // Prepare timeline variables for this block's videos
    var blockVideoStimuli = block.videos.map(function(video, idx) {
      return {
        filepath: [video.filepath],
        filename: video.filename,
        video_type: video.type,
        video_index: video.index,
        trial_in_block: idx + 1,
        block_type: block.blockType,
        block_order: block.blockOrder
      };
    });

    // Video trial template
    var video_trial = {
      type: VideoKeyboardResponsePlugin,
      stimulus: jsPsych.timelineVariable('filepath'),
      choices: "ALL_KEYS",
      prompt: function() {
        var trialNum = jsPsych.timelineVariable('trial_in_block');
        var blockType = jsPsych.timelineVariable('block_type');
        return `<p>Block: ${blockType} | Video ${trialNum} of 6</p><p>Press any key to continue</p>`;
      },
      width: 640,
      height: 480,
      autoplay: true,
      response_ends_trial: true,
      data: {
        task: 'video',
        filename: jsPsych.timelineVariable('filename'),
        video_type: jsPsych.timelineVariable('video_type'),
        video_index: jsPsych.timelineVariable('video_index'),
        trial_in_block: jsPsych.timelineVariable('trial_in_block'),
        block_type: jsPsych.timelineVariable('block_type'),
        block_order: jsPsych.timelineVariable('block_order')
      }
    };

    // Arousal rating after each video
    var arousal_rating = {
      type: SurveyLikertPlugin,
      questions: [
        {
          prompt: "How aroused did you feel while watching this video?",
          labels: ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10"],
          required: false,
          name: 'arousal'
        }
      ],
      data: {
        task: 'arousal_rating',
        filename: jsPsych.timelineVariable('filename'),
        video_type: jsPsych.timelineVariable('video_type'),
        video_index: jsPsych.timelineVariable('video_index'),
        trial_in_block: jsPsych.timelineVariable('trial_in_block'),
        block_type: jsPsych.timelineVariable('block_type'),
        block_order: jsPsych.timelineVariable('block_order')
      }
    };

    // Video procedure for this block (video + arousal rating)
    var video_procedure = {
      timeline: [video_trial, arousal_rating],
      timeline_variables: blockVideoStimuli
    };
    timeline.push(video_procedure);
  }

  // End screen
  var end_screen = {
    type: HtmlKeyboardResponsePlugin,
    stimulus: "<h1>Experiment Complete</h1><p>Thank you for participating!</p><p>Press any key to finish.</p>",
  };
  timeline.push(end_screen);

  await jsPsych.run(timeline);

  return jsPsych;
}
