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

  var allVideos = await loadJSON('assets/videos.json');

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

  // Function to create rating questions for a video
  function createRatingQuestions(videoData) {
    var ratings = ['arousal', 'pleasure', 'distraction', 'immersion'];
    var ratingTrials = [];

    for (var i = 0; i < ratings.length; i++) {
      var ratingName = ratings[i];
      var trial = {
        type: SurveyTextPlugin,
        questions: [
          {
            prompt: `<img src="assets/${ratingName}.jpg" style="max-width: 100%; max-height: 75vh; display: block; margin: 0 auto 10px auto;">`,
            name: ratingName,
            required: true,
            placeholder: 'Enter 1-10',
            rows: 1,
            columns: 10
          }
        ],
        button_label: '',
        autocomplete: false,
        data: Object.assign({
          task: 'rating',
          rating_type: ratingName
        }, videoData),
        on_load: function() {
          // Auto-submit on Enter key
          var input = document.querySelector('input[type="text"]');
          if (input) {
            input.addEventListener('keypress', function(e) {
              if (e.key === 'Enter') {
                e.preventDefault();
                var button = document.querySelector('#jspsych-survey-text-next');
                if (button) {
                  button.click();
                }
              }
            });
          }
        },
        on_finish: function(data) {
          // Validate input is 1-10
          var response = data.response[Object.keys(data.response)[0]];
          var num = parseInt(response);
          if (isNaN(num) || num < 1 || num > 10) {
            alert('Please enter a number between 1 and 10');
          }
        }
      };
      ratingTrials.push(trial);
    }

    return ratingTrials;
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

  // Variable to store PID
  var entered_pid = '';

  // PID entry
  var pid_entry = {
    type: SurveyTextPlugin,
    questions: [
      {
        prompt: '<p style="font-size: 20px;">Participant PID:</p>',
        name: 'pid',
        required: true,
        placeholder: '',
        rows: 1,
        columns: 20
      }
    ],
    button_label: 'Continue',
    autocomplete: false,
    post_trial_gap: 200,
    data: { task: 'pid_entry' },
    on_finish: function(data) {
      // Store PID
      entered_pid = data.response.pid;
      jsPsych.data.addProperties({
        participant_pid: entered_pid
      });
    }
  };

  // PID confirmation - separate page
  var pid_confirmation = {
    type: HtmlButtonResponsePlugin,
    stimulus: function() {
      return `<p style="font-size: 20px; text-align: center; margin-bottom: 20px;">Please confirm that this PID is correct: ${entered_pid}</p>`;
    },
    choices: ['Yes', 'No'],
    data: { task: 'pid_confirmation' }
  };

  // Blank transition screen
  var pid_transition = {
    type: HtmlKeyboardResponsePlugin,
    stimulus: '',
    choices: "NO_KEYS",
    trial_duration: 100,
    data: { task: 'transition' }
  };

  // Loop for PID entry/confirmation with proper separation
  var pid_loop = {
    timeline: [pid_entry, pid_transition, pid_confirmation],
    loop_function: function(data) {
      // Get the confirmation response (last trial in timeline)
      var last_trial = data.values()[data.values().length - 1];
      // If they clicked "No" (button index 1), loop again
      if (last_trial.response === 1) {
        return true; // Loop again - go back to PID entry
      } else {
        return false; // Continue to experiment
      }
    }
  };

  // Welcome screen
  var welcome = {
    type: HtmlKeyboardResponsePlugin,
    stimulus: "<h1 style='font-size: 36px !important;'>Experiment</h1>",
    choices: ["n", "N"]
  };

  // Nature video instructions
  var nature_instructions = {
    type: HtmlKeyboardResponsePlugin,
    stimulus: `
      <div style="display: flex; align-items: center; justify-content: center; min-height: 50vh;">
        <p style="font-size: 20px; line-height: 1.6; text-align: center; max-width: 750px;">
          You will now watch a nature video. Take this moment to get comfortable, relax your shoulders, breathe normally, and simply watch the video.
        </p>
      </div>
    `,
    choices: ["n", "N"],
    trial_duration: 10000,
    data: { task: 'nature_instructions' }
  };

  // Nature video - auto advances when done, can skip with 'n'
  var nature_video = {
    type: VideoKeyboardResponsePlugin,
    stimulus: ['assets/nature.mp4'],
    choices: ["n", "N"],
    prompt: null,
    width: 1000,
    height: 750,
    autoplay: true,
    trial_ends_after_video: true,
    response_ends_trial: true,
    data: {
      task: 'nature_video',
      filename: 'nature.mp4'
    }
  };

  // Build timeline
  timeline.push(preload);
  timeline.push(pid_loop);
  timeline.push(welcome);
  timeline.push(nature_instructions);
  timeline.push(nature_video);

  // Add rating questions after nature video
  var natureRatings = createRatingQuestions({ video_type: 'nature', filename: 'nature.mp4' });
  for (var i = 0; i < natureRatings.length; i++) {
    timeline.push(natureRatings[i]);
  }

  // Block practice components for each condition
  var blockPractice = {
    neutral: {
      audio_intro: {
        type: HtmlKeyboardResponsePlugin,
        stimulus: '<div style="display: flex; align-items: center; justify-content: center; min-height: 50vh;"><p style="font-size: 20px; text-align: center;">You will now listen to audio instructions that will teach you how to apply a natural approach.</p></div>',
        choices: ["n", "N"],
        trial_duration: 5000,
        data: { task: 'audio_intro', condition: 'neutral' }
      },
      audio_play: {
        type: HtmlKeyboardResponsePlugin,
        stimulus: '<audio id="audio-instruction" autoplay><source src="assets/natural.wav" type="audio/wav"></audio><div style="display: flex; align-items: center; justify-content: center; min-height: 50vh;"><p style="font-size: 20px; text-align: center;">Audio now in progress.</p></div>',
        choices: ["n", "N"],
        on_load: function() {
          var audio = document.getElementById('audio-instruction');
          audio.addEventListener('ended', function() {
            jsPsych.finishTrial();
          });
        },
        data: { task: 'audio_play', condition: 'neutral' }
      },
      practice_intro: {
        type: HtmlKeyboardResponsePlugin,
        stimulus: '<div style="display: flex; align-items: center; justify-content: center; min-height: 50vh;"><p style="font-size: 20px; text-align: center;">You will now apply the approach you learned onto a guided video.</p></div>',
        choices: ["n", "N"],
        trial_duration: 5000,
        data: { task: 'practice_intro', condition: 'neutral' }
      },
      practice_video: {
        type: VideoKeyboardResponsePlugin,
        stimulus: ['assets/naturalpractice.mp4'],
        choices: ["n", "N"],
        width: 1000,
        height: 750,
        autoplay: true,
        response_ends_trial: true,
        trial_ends_after_video: true,
        data: { task: 'practice_video', condition: 'neutral', filename: 'naturalpractice.mp4' }
      }
    },
    participatory: {
      audio_intro: {
        type: HtmlKeyboardResponsePlugin,
        stimulus: '<div style="display: flex; align-items: center; justify-content: center; min-height: 50vh;"><p style="font-size: 20px; text-align: center;">You will now listen to audio instructions that will teach you how to apply a participating approach.</p></div>',
        choices: ["n", "N"],
        trial_duration: 5000,
        data: { task: 'audio_intro', condition: 'participatory' }
      },
      audio_play: {
        type: HtmlKeyboardResponsePlugin,
        stimulus: '<audio id="audio-instruction" autoplay><source src="assets/participate.wav" type="audio/wav"></audio><div style="display: flex; align-items: center; justify-content: center; min-height: 50vh;"><p style="font-size: 20px; text-align: center;">Audio now in progress.</p></div>',
        choices: ["n", "N"],
        on_load: function() {
          var audio = document.getElementById('audio-instruction');
          audio.addEventListener('ended', function() {
            jsPsych.finishTrial();
          });
        },
        data: { task: 'audio_play', condition: 'participatory' }
      },
      practice_intro: {
        type: HtmlKeyboardResponsePlugin,
        stimulus: '<div style="display: flex; align-items: center; justify-content: center; min-height: 50vh;"><p style="font-size: 20px; text-align: center;">You will now apply the approach you learned onto a guided video.</p></div>',
        choices: ["n", "N"],
        trial_duration: 5000,
        data: { task: 'practice_intro', condition: 'participatory' }
      },
      practice_video: {
        type: VideoKeyboardResponsePlugin,
        stimulus: ['assets/participatepractice.mp4'],
        choices: ["n", "N"],
        width: 1000,
        height: 750,
        autoplay: true,
        response_ends_trial: true,
        trial_ends_after_video: true,
        data: { task: 'practice_video', condition: 'participatory', filename: 'participatepractice.mp4' }
      }
    },
    observatory: {
      audio_intro: {
        type: HtmlKeyboardResponsePlugin,
        stimulus: '<div style="display: flex; align-items: center; justify-content: center; min-height: 50vh;"><p style="font-size: 20px; text-align: center;">You will now listen to audio instructions that will teach you how to apply an observing approach.</p></div>',
        choices: ["n", "N"],
        trial_duration: 5000,
        data: { task: 'audio_intro', condition: 'observatory' }
      },
      audio_play: {
        type: HtmlKeyboardResponsePlugin,
        stimulus: '<audio id="audio-instruction" autoplay><source src="assets/observe.wav" type="audio/wav"></audio><div style="display: flex; align-items: center; justify-content: center; min-height: 50vh;"><p style="font-size: 20px; text-align: center;">Audio now in progress.</p></div>',
        choices: ["n", "N"],
        on_load: function() {
          var audio = document.getElementById('audio-instruction');
          audio.addEventListener('ended', function() {
            jsPsych.finishTrial();
          });
        },
        data: { task: 'audio_play', condition: 'observatory' }
      },
      practice_intro: {
        type: HtmlKeyboardResponsePlugin,
        stimulus: '<div style="display: flex; align-items: center; justify-content: center; min-height: 50vh;"><p style="font-size: 20px; text-align: center;">You will now apply the approach you learned onto a guided video.</p></div>',
        choices: ["n", "N"],
        trial_duration: 5000,
        data: { task: 'practice_intro', condition: 'observatory' }
      },
      practice_video: {
        type: VideoKeyboardResponsePlugin,
        stimulus: ['assets/observepractice.mp4'],
        choices: ["n", "N"],
        width: 1000,
        height: 750,
        autoplay: true,
        response_ends_trial: true,
        trial_ends_after_video: true,
        data: { task: 'practice_video', condition: 'observatory', filename: 'observepractice.mp4' }
      }
    }
  };

  // Condition instructions
  var conditionInstructions = {
    neutral: {
      type: HtmlKeyboardResponsePlugin,
      stimulus: `
        <div style="background-color: #808080; display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 20px;">
          <div style="font-family: Arial, Helvetica, sans-serif; text-align: center; max-width: 750px; color: black;">
            <h1 style="font-size: 32px; font-weight: bold; margin-bottom: 30px; color: black;">Natural Approach</h1>
            <p style="font-size: 20px; line-height: 1.6; margin-bottom: 40px; color: black;">
              Please watch the video just as you normally would at home. You're in a private space with no cameras or observers.
              Engage with the video in whatever way feels most typical for you. The idea is simply to watch as you would outside
              of a research setting. Enjoy the video as you normally would, as if this were on your own time, in your own space,
              for your own purpose.
            </p>
            <p style="font-size: 20px; margin-top: 40px; color: black;">The video will play shortly.</p>
          </div>
        </div>
      `,
      choices: ["n", "N"],
      trial_duration: 30000,
      data: { task: 'condition_instructions', condition: 'neutral' }
    },
    observatory: {
      type: HtmlKeyboardResponsePlugin,
      stimulus: `
        <div style="background-color: #808080; display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 20px;">
          <div style="font-family: Arial, Helvetica, sans-serif; text-align: center; max-width: 750px; color: black;">
            <h1 style="font-size: 32px; font-weight: bold; margin-bottom: 30px; color: black;">Observing Approach</h1>
            <p style="font-size: 20px; line-height: 1.6; margin-bottom: 40px; color: black;">
              As you watch the video, observe both the scene and your own responses as they happen in the present moment.
              Notice what you see, hear, and feel without trying to change or react. When sensations arise, observe how they
              emerge, shift, and possibly fade or grow stronger. If thoughts or judgments arise, simply acknowledge them and
              continue observing. Simply be present with whatever experience arises, fully aware, nonjudgmental, as each moment passes.
            </p>
            <p style="font-size: 20px; margin-top: 40px; color: black;">The video will play shortly.</p>
          </div>
        </div>
      `,
      choices: ["n", "N"],
      trial_duration: 30000,
      data: { task: 'condition_instructions', condition: 'observatory' }
    },
    participatory: {
      type: HtmlKeyboardResponsePlugin,
      stimulus: `
        <div style="background-color: #808080; display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 20px;">
          <div style="font-family: Arial, Helvetica, sans-serif; text-align: center; max-width: 750px; color: black;">
            <h1 style="font-size: 32px; font-weight: bold; margin-bottom: 30px; color: black;">Participating Approach</h1>
            <p style="font-size: 20px; line-height: 1.6; margin-bottom: 40px; color: black;">
              Let yourself enter the video fully, as if the imagery and sounds are happening not just around you, but within you.
              Allow the scene to draw you in—feeling each moment in your body, letting the rhythm and intensity guide your attention.
              As distractions fade, tune into the sensations that rise and shift, and let them pull you deeper into the experience.
              The more you release the need to observe from a distance, the more naturally you'll become part of what's unfolding.
              Stay with it—fully engaged, fully immersed, moment by moment.
            </p>
            <p style="font-size: 20px; margin-top: 40px; color: black;">The video will play shortly.</p>
          </div>
        </div>
      `,
      choices: ["n", "N"],
      trial_duration: 30000,
      data: { task: 'condition_instructions', condition: 'participatory' }
    }
  };

  // Add each block
  for (var b = 0; b < blocks.length; b++) {
    var block = blocks[b];

    // Add practice sequence for this block
    timeline.push(blockPractice[block.blockType].audio_intro);
    timeline.push(blockPractice[block.blockType].audio_play);
    timeline.push(blockPractice[block.blockType].practice_intro);
    timeline.push(blockPractice[block.blockType].practice_video);

    // Add rating questions after practice video
    var practiceFilename = block.blockType === 'neutral' ? 'naturalpractice.mp4' :
                          block.blockType === 'participatory' ? 'participatepractice.mp4' :
                          'observepractice.mp4';
    var practiceRatings = createRatingQuestions({
      video_type: 'practice',
      filename: practiceFilename,
      condition: block.blockType,
      block_order: block.blockOrder
    });
    for (var r = 0; r < practiceRatings.length; r++) {
      timeline.push(practiceRatings[r]);
    }

    // Add condition-specific instructions paragraph
    timeline.push(conditionInstructions[block.blockType]);

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
      choices: ["n", "N"],
      prompt: function() {
        var trialNum = jsPsych.timelineVariable('trial_in_block');
        var blockType = jsPsych.timelineVariable('block_type');
        return `<p>Block: ${blockType} | Video ${trialNum} of 6</p>`;
      },
      width: 1000,
      height: 750,
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

    // Rating questions after each video
    var rating_questions = {
      timeline: createRatingQuestions({
        filename: jsPsych.timelineVariable('filename'),
        video_type: jsPsych.timelineVariable('video_type'),
        video_index: jsPsych.timelineVariable('video_index'),
        trial_in_block: jsPsych.timelineVariable('trial_in_block'),
        block_type: jsPsych.timelineVariable('block_type'),
        block_order: jsPsych.timelineVariable('block_order')
      })
    };

    // Video procedure for this block (video + 4 rating questions)
    var video_procedure = {
      timeline: [video_trial].concat(createRatingQuestions({
        filename: jsPsych.timelineVariable('filename'),
        video_type: jsPsych.timelineVariable('video_type'),
        video_index: jsPsych.timelineVariable('video_index'),
        trial_in_block: jsPsych.timelineVariable('trial_in_block'),
        block_type: jsPsych.timelineVariable('block_type'),
        block_order: jsPsych.timelineVariable('block_order')
      })),
      timeline_variables: blockVideoStimuli
    };
    timeline.push(video_procedure);
  }

  // End screen
  var end_screen = {
    type: HtmlKeyboardResponsePlugin,
    stimulus: "<h1>Experiment Complete</h1><p>Thank you for participating!</p>",
    choices: ["n", "N"]
  };
  timeline.push(end_screen);

  await jsPsych.run(timeline);

  return jsPsych;
}
