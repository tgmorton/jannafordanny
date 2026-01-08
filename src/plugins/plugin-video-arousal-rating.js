import { JsPsych, JsPsychPlugin, ParameterType, TrialType } from "jspsych";

const info = {
  name: "video-arousal-rating",
  parameters: {
    /** Video file(s) to play */
    stimulus: {
      type: ParameterType.VIDEO,
      default: undefined,
      array: true,
    },
    /** Width of the video in pixels */
    video_width: {
      type: ParameterType.INT,
      default: 640,
    },
    /** Height of the video in pixels */
    video_height: {
      type: ParameterType.INT,
      default: 480,
    },
    /** Whether to autoplay the video */
    autoplay: {
      type: ParameterType.BOOL,
      default: true,
    },
    /** Minimum value of the slider */
    slider_min: {
      type: ParameterType.INT,
      default: 0,
    },
    /** Maximum value of the slider */
    slider_max: {
      type: ParameterType.INT,
      default: 10,
    },
    /** Starting value of the slider */
    slider_start: {
      type: ParameterType.INT,
      default: 5,
    },
    /** Labels for the slider endpoints [bottom, top] */
    slider_labels: {
      type: ParameterType.STRING,
      array: true,
      default: ["0", "10"],
    },
    /** Input mode: "keyboard" or "trackpad" */
    input_mode: {
      type: ParameterType.STRING,
      default: "keyboard",
    },
    /** How much each arrow key press moves the slider */
    keyboard_step: {
      type: ParameterType.INT,
      default: 1,
    },
    /** Sampling rate in milliseconds */
    sample_rate_ms: {
      type: ParameterType.INT,
      default: 100,
    },
    /** Whether to show trail visualization */
    trail_enabled: {
      type: ParameterType.BOOL,
      default: true,
    },
    /** Color of the trail line */
    trail_color: {
      type: ParameterType.STRING,
      default: "rgba(70, 130, 180, 1)",
    },
    /** Whether trial ends when video ends */
    trial_ends_after_video: {
      type: ParameterType.BOOL,
      default: true,
    },
    /** Optional prompt to display */
    prompt: {
      type: ParameterType.HTML_STRING,
      default: null,
    },
    /** Countdown seconds before video starts (for trackpad centering) */
    centering_duration: {
      type: ParameterType.INT,
      default: 10,
    },
  },
};

class VideoArousalRatingPlugin {
  static info = info;

  constructor(jsPsych) {
    this.jsPsych = jsPsych;
  }

  trial(display_element, trial) {
    // State variables
    this.currentValue = trial.slider_start;
    this.sliderMin = trial.slider_min;
    this.sliderMax = trial.slider_max;
    this.ratingsHistory = [];
    this.startTime = performance.now();
    this.videoDuration = 0;
    this.samplingInterval = null;
    this.keyboardListener = null;
    this.isKeyHeld = { up: false, down: false };
    this.keyHeldInterval = null;
    this.videoStarted = false;
    this.isRecording = false; // Only record when video is playing

    // Build the HTML
    let html = `<div id="jspsych-video-arousal-container">`;

    // Inline countdown message (shown above video for trackpad mode)
    if (trial.input_mode === 'trackpad') {
      html += `<div id="countdown-banner">
        <span id="countdown-status">Position your finger in the tracking area below</span>
        <span id="countdown-timer"></span>
      </div>`;
    }

    html += `<div id="video-trail-wrapper">`;

    // Trail canvas (left side)
    if (trial.trail_enabled) {
      html += `<div id="trail-container">
        <canvas id="arousal-trail-canvas" width="200" height="${trial.video_height}"></canvas>
        <div id="trail-time-label">Time →</div>
      </div>`;
    }

    // Video element (center) - don't autoplay yet for trackpad mode
    const shouldAutoplay = trial.input_mode === 'keyboard' && trial.autoplay;
    html += `<div id="video-container">
      <video id="jspsych-video-arousal-video"
             width="${trial.video_width}"
             height="${trial.video_height}"
             ${shouldAutoplay ? 'autoplay' : ''}
             playsinline>`;

    for (const src of trial.stimulus) {
      const type = src.toLowerCase().endsWith('.webm') ? 'video/webm' : 'video/mp4';
      html += `<source src="${src}" type="${type}">`;
    }
    html += `</video></div>`;

    // Right side: thermometer for trackpad mode, slider for keyboard mode
    if (trial.input_mode === 'trackpad') {
      // Simple numeric labels 0-10
      let labelsHtml = '';
      for (let i = 10; i >= 0; i--) {
        const position = (i / 10) * 100;
        labelsHtml += `<div class="thermometer-label" style="bottom: ${position}%;">
          <span class="label-tick"></span>
          <span class="label-value">${i}</span>
        </div>`;
      }

      html += `<div id="thermometer-container">
        <div id="thermometer-labels">${labelsHtml}</div>
        <div id="thermometer-track">
          <div id="thermometer-fill"></div>
          <div id="thermometer-bulb"></div>
          <div id="thermometer-indicator"></div>
        </div>
        <div id="thermometer-value">${this.currentValue}</div>
      </div>`;
    } else {
      // Keyboard mode - keep original slider
      html += `<div id="arousal-slider-container">
        <div id="slider-label-top">${trial.slider_labels[1] || trial.slider_max}</div>
        <div id="slider-track">
          <div id="slider-fill"></div>
          <div id="slider-thumb"></div>
        </div>
        <div id="slider-label-bottom">${trial.slider_labels[0] || trial.slider_min}</div>
        <div id="slider-value">${this.currentValue}</div>
      </div>`;
    }

    html += `</div>`; // end video-trail-wrapper

    // Keyboard instructions (only for keyboard mode)
    if (trial.input_mode !== 'trackpad') {
      html += `<div id="keyboard-instructions">
        <p>Use <strong>↑</strong> and <strong>↓</strong> arrow keys to adjust rating</p>
      </div>`;
    }

    // Prompt
    if (trial.prompt !== null) {
      html += `<div id="arousal-prompt">${trial.prompt}</div>`;
    }

    html += `</div>`; // end container

    display_element.innerHTML = html;

    // Add trackpad-mode class to body if in trackpad mode (hides cursor globally)
    if (trial.input_mode === 'trackpad') {
      document.body.classList.add('trackpad-mode');
    }

    // Get element references
    this.video = display_element.querySelector('#jspsych-video-arousal-video');
    this.canvas = trial.trail_enabled ? display_element.querySelector('#arousal-trail-canvas') : null;
    this.ctx = this.canvas ? this.canvas.getContext('2d') : null;
    this.countdownBanner = display_element.querySelector('#countdown-banner');
    this.countdownStatus = display_element.querySelector('#countdown-status');
    this.countdownTimer = display_element.querySelector('#countdown-timer');
    this.isFingerInArea = false;

    // Get thermometer or slider elements depending on mode
    if (trial.input_mode === 'trackpad') {
      this.thermometerFill = display_element.querySelector('#thermometer-fill');
      this.thermometerIndicator = display_element.querySelector('#thermometer-indicator');
      this.thermometerValue = display_element.querySelector('#thermometer-value');
      this.thermometerTrack = display_element.querySelector('#thermometer-track');
    } else {
      this.sliderThumb = display_element.querySelector('#slider-thumb');
      this.sliderFill = display_element.querySelector('#slider-fill');
      this.sliderValue = display_element.querySelector('#slider-value');
    }

    // Initialize slider position
    this.updateSliderDisplay();

    // Setup video event handlers
    this.video.addEventListener('loadedmetadata', () => {
      this.videoDuration = this.video.duration * 1000; // Convert to ms
    });

    this.video.addEventListener('play', () => {
      this.videoStarted = true;
      this.isRecording = true;
      this.videoPlayStartTime = performance.now();
      // Start sampling only when video plays
      this.startDataSampling(trial);
    });

    this.video.addEventListener('ended', () => {
      this.isRecording = false;
      if (trial.trial_ends_after_video) {
        this.endTrial(trial);
      }
    });

    // Setup input handling immediately (so they can practice during countdown)
    if (trial.input_mode === 'keyboard') {
      this.setupKeyboardInput(trial);
      // For keyboard mode, video autoplays, so start recording
      if (shouldAutoplay) {
        this.isRecording = true;
        this.startDataSampling(trial);
      }
    } else {
      this.setupTrackpadInput(trial);
      // Start countdown for trackpad mode
      this.startCountdown(trial);
    }

    // Draw initial trail
    if (this.canvas) {
      this.drawTrail(trial);
    }
  }

  startCountdown(trial) {
    let secondsLeft = trial.centering_duration;
    let countdownStarted = false;

    // Update status based on finger/mouse activity
    const updateStatus = () => {
      if (!this.isFingerInArea) {
        // No activity detected - prompt them
        if (this.countdownStatus) {
          this.countdownStatus.textContent = 'Move your finger on the trackpad to begin';
          this.countdownStatus.classList.add('waiting');
          this.countdownStatus.classList.remove('ready');
        }
        if (this.countdownTimer) {
          this.countdownTimer.textContent = '';
        }
        const thermometerContainer = document.getElementById('thermometer-container');
        if (thermometerContainer) {
          thermometerContainer.classList.add('waiting-for-finger');
          thermometerContainer.classList.remove('finger-detected');
        }
        return false;
      } else {
        // Activity detected
        if (this.countdownStatus) {
          this.countdownStatus.classList.remove('waiting');
          this.countdownStatus.classList.add('ready');
        }
        const thermometerContainer = document.getElementById('thermometer-container');
        if (thermometerContainer) {
          thermometerContainer.classList.remove('waiting-for-finger');
          thermometerContainer.classList.add('finger-detected');
        }
        return true;
      }
    };

    // Check every 100ms for activity and countdown
    const checkInterval = setInterval(() => {
      const fingerReady = updateStatus();

      if (fingerReady) {
        if (!countdownStarted) {
          countdownStarted = true;
          secondsLeft = trial.centering_duration;
        }

        if (this.countdownStatus) {
          this.countdownStatus.textContent = 'Ready! Keep your finger on the trackpad...';
        }
        if (this.countdownTimer) {
          this.countdownTimer.textContent = `Video starts in ${secondsLeft}s`;
        }

        // Decrement every second (this runs every 100ms, so check timing)
        if (this.lastCountdownUpdate === undefined ||
            performance.now() - this.lastCountdownUpdate >= 1000) {
          this.lastCountdownUpdate = performance.now();
          secondsLeft--;
        }

        if (secondsLeft <= 0) {
          clearInterval(checkInterval);
          // Update countdown banner for recording
          if (this.countdownBanner) {
            this.countdownBanner.classList.add('video-playing');
            this.countdownStatus.textContent = 'Recording...';
            this.countdownTimer.textContent = '';
          }
          // Start video
          this.video.play();
        }
      } else {
        // Reset countdown if no activity
        countdownStarted = false;
        secondsLeft = trial.centering_duration;
        this.lastCountdownUpdate = undefined;
      }
    }, 100);
  }

  updateSliderDisplay() {
    const range = this.sliderMax - this.sliderMin;
    const percentage = ((this.currentValue - this.sliderMin) / range) * 100;
    const displayValue = Math.round(this.currentValue * 10) / 10;

    // Update thermometer if in trackpad mode
    if (this.thermometerFill) {
      this.thermometerFill.style.height = `${percentage}%`;
      this.thermometerIndicator.style.bottom = `${percentage}%`;
      this.thermometerValue.textContent = displayValue;
    }

    // Update slider if in keyboard mode
    if (this.sliderThumb) {
      this.sliderThumb.style.bottom = `calc(${percentage}% - 10px)`;
      this.sliderFill.style.height = `${percentage}%`;
      this.sliderValue.textContent = displayValue;
    }
  }

  updateSliderValue(newValue) {
    this.currentValue = Math.max(this.sliderMin, Math.min(this.sliderMax, newValue));
    this.updateSliderDisplay();
  }

  recordEvent(eventType) {
    // Only record when video is playing
    if (!this.isRecording) return;

    const timestamp = this.video ? this.video.currentTime * 1000 : 0;
    this.ratingsHistory.push({
      timestamp: Math.round(timestamp),
      value: Math.round(this.currentValue * 10) / 10,
      event: eventType,
    });
  }

  startDataSampling(trial) {
    // Clear any existing interval
    if (this.samplingInterval) {
      clearInterval(this.samplingInterval);
    }

    this.samplingInterval = setInterval(() => {
      if (this.isRecording) {
        this.recordEvent('sample');
      }
      if (this.canvas) {
        this.drawTrail(trial);
      }
    }, trial.sample_rate_ms);
  }

  setupKeyboardInput(trial) {
    const step = trial.keyboard_step;

    // Add delay before 'n' key can skip (prevents immediate skip from previous screen)
    this.canSkip = false;
    setTimeout(() => {
      this.canSkip = true;
    }, 500);

    // Key down handler
    const keyDownHandler = (e) => {
      // Skip trial with 'n' or 'N' key (only after delay)
      if ((e.key === 'n' || e.key === 'N') && this.canSkip) {
        e.preventDefault();
        this.endTrial(trial);
        return;
      }

      if (e.key === 'ArrowUp' && !this.isKeyHeld.up) {
        e.preventDefault();
        this.isKeyHeld.up = true;
        this.updateSliderValue(this.currentValue + step);
        this.recordEvent('keypress_up');

        // Start continuous movement after initial press
        this.keyHeldInterval = setInterval(() => {
          if (this.isKeyHeld.up) {
            this.updateSliderValue(this.currentValue + step);
            this.recordEvent('keyhold_up');
          }
        }, 100);
      } else if (e.key === 'ArrowDown' && !this.isKeyHeld.down) {
        e.preventDefault();
        this.isKeyHeld.down = true;
        this.updateSliderValue(this.currentValue - step);
        this.recordEvent('keypress_down');

        this.keyHeldInterval = setInterval(() => {
          if (this.isKeyHeld.down) {
            this.updateSliderValue(this.currentValue - step);
            this.recordEvent('keyhold_down');
          }
        }, 100);
      }
    };

    // Key up handler
    const keyUpHandler = (e) => {
      if (e.key === 'ArrowUp') {
        this.isKeyHeld.up = false;
      } else if (e.key === 'ArrowDown') {
        this.isKeyHeld.down = false;
      }

      if (!this.isKeyHeld.up && !this.isKeyHeld.down && this.keyHeldInterval) {
        clearInterval(this.keyHeldInterval);
        this.keyHeldInterval = null;
      }
    };

    document.addEventListener('keydown', keyDownHandler);
    document.addEventListener('keyup', keyUpHandler);

    // Store for cleanup
    this.keyDownHandler = keyDownHandler;
    this.keyUpHandler = keyUpHandler;
  }

  setupTrackpadInput(trial) {
    const container = document.getElementById('thermometer-container');

    // Add delay before 'n' key can skip (prevents immediate skip from previous screen)
    this.canSkip = false;
    setTimeout(() => {
      this.canSkip = true;
    }, 500);

    // Add keyboard listener for 'n' key to skip in trackpad mode too
    const skipKeyHandler = (e) => {
      if ((e.key === 'n' || e.key === 'N') && this.canSkip) {
        e.preventDefault();
        this.endTrial(trial);
      }
    };
    document.addEventListener('keydown', skipKeyHandler);
    this.skipKeyHandler = skipKeyHandler;

    // Track the full screen/window for input
    // Bottom of screen = 0, top of screen = 10
    let isTracking = false;

    // Calculate value from Y position relative to the WINDOW
    // Middle 80% of screen maps to full 0-10 range (top/bottom 10% are clamped)
    // This means users don't need to go to extreme edges of trackpad
    const calculateValueFromPosition = (clientY) => {
      const windowHeight = window.innerHeight;
      const topMargin = windowHeight * 0.1;    // Top 10% = value 10
      const bottomMargin = windowHeight * 0.9; // Bottom 10% = value 0
      const usableHeight = bottomMargin - topMargin; // Middle 80%

      // If above top margin, clamp to max; if below bottom margin, clamp to min
      if (clientY <= topMargin) {
        return this.sliderMax;
      }
      if (clientY >= bottomMargin) {
        return this.sliderMin;
      }

      // Map position within usable range to 0-10
      // clientY increases downward, so invert: top of usable = 10, bottom of usable = 0
      const positionInUsable = clientY - topMargin;
      const normalizedPosition = 1 - (positionInUsable / usableHeight); // 1 at top, 0 at bottom

      const range = this.sliderMax - this.sliderMin;
      const value = this.sliderMin + (normalizedPosition * range);

      return value;
    };

    const handleMove = (e) => {
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;

      // Calculate and update slider value based on position on screen
      const newValue = calculateValueFromPosition(clientY);
      this.updateSliderValue(newValue);

      if (!isTracking) {
        isTracking = true;
        if (container) container.classList.add('active');
        this.isFingerInArea = true;
      }

      // Only record if video is playing
      if (this.isRecording) {
        this.recordEvent('position_update');
      }
    };

    const handleStart = (e) => {
      this.isFingerInArea = true;
      if (container) container.classList.add('hovering');
      handleMove(e);
    };

    const handleEnd = () => {
      if (isTracking) {
        isTracking = false;
        if (container) container.classList.remove('active');
        if (this.isRecording) {
          this.recordEvent('tracking_pause');
        }
      }
      if (container) container.classList.remove('hovering');
      this.isFingerInArea = false;
    };

    // Listen on the entire document for mouse/touch movement
    // Touch events
    document.addEventListener('touchstart', handleStart, { passive: true });
    document.addEventListener('touchmove', handleMove, { passive: true });
    document.addEventListener('touchend', handleEnd);
    document.addEventListener('touchcancel', handleEnd);

    // Mouse events - track position continuously anywhere on screen
    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseenter', handleStart);
    document.addEventListener('mouseleave', handleEnd);

    // Store for cleanup
    this.trackpadCleanup = () => {
      document.removeEventListener('touchstart', handleStart);
      document.removeEventListener('touchmove', handleMove);
      document.removeEventListener('touchend', handleEnd);
      document.removeEventListener('touchcancel', handleEnd);
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseenter', handleStart);
      document.removeEventListener('mouseleave', handleEnd);
    };
  }

  drawTrail(trial) {
    if (!this.ctx || !this.canvas) return;

    const width = this.canvas.width;
    const height = this.canvas.height;
    const duration = this.videoDuration || 60000; // Default to 60s if not loaded

    // Clear canvas
    this.ctx.clearRect(0, 0, width, height);

    // Draw background grid
    this.ctx.strokeStyle = '#e0e0e0';
    this.ctx.lineWidth = 1;
    for (let i = 0; i <= 10; i++) {
      const y = (i / 10) * height;
      this.ctx.beginPath();
      this.ctx.moveTo(0, y);
      this.ctx.lineTo(width, y);
      this.ctx.stroke();
    }

    // Draw rating history as LINE ONLY (no fill)
    if (this.ratingsHistory.length > 1) {
      this.ctx.beginPath();
      this.ctx.strokeStyle = trial.trail_color;
      this.ctx.lineWidth = 2.5;

      for (let i = 0; i < this.ratingsHistory.length; i++) {
        const point = this.ratingsHistory[i];
        const x = (point.timestamp / duration) * width;
        // Normalize value to 0-1 range based on slider min/max
        const normalizedValue = (point.value - this.sliderMin) / (this.sliderMax - this.sliderMin);
        const y = height - normalizedValue * height;

        if (i === 0) {
          this.ctx.moveTo(x, y);
        } else {
          this.ctx.lineTo(x, y);
        }
      }
      this.ctx.stroke();
    }

    // Draw current time marker
    if (this.video && this.video.currentTime > 0) {
      const currentX = (this.video.currentTime * 1000 / duration) * width;
      this.ctx.strokeStyle = '#ff4444';
      this.ctx.lineWidth = 2;
      this.ctx.beginPath();
      this.ctx.moveTo(currentX, 0);
      this.ctx.lineTo(currentX, height);
      this.ctx.stroke();
    }
  }

  endTrial(trial) {
    // Stop sampling
    if (this.samplingInterval) {
      clearInterval(this.samplingInterval);
    }

    // Stop key held interval
    if (this.keyHeldInterval) {
      clearInterval(this.keyHeldInterval);
    }

    // Remove keyboard listeners
    if (this.keyDownHandler) {
      document.removeEventListener('keydown', this.keyDownHandler);
      document.removeEventListener('keyup', this.keyUpHandler);
    }

    // Remove trackpad listeners and restore cursor
    if (this.trackpadCleanup) {
      this.trackpadCleanup();
      document.body.classList.remove('trackpad-mode');
    }

    // Remove skip key handler for trackpad mode
    if (this.skipKeyHandler) {
      document.removeEventListener('keydown', this.skipKeyHandler);
    }

    // Calculate summary statistics
    const values = this.ratingsHistory.map(r => r.value);
    let mean = 0, std = 0, minVal = 0, maxVal = 0;

    if (values.length > 0) {
      mean = values.reduce((a, b) => a + b, 0) / values.length;
      const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
      std = Math.sqrt(variance);
      minVal = Math.min(...values);
      maxVal = Math.max(...values);
    }

    // Prepare trial data
    const trialData = {
      stimulus: trial.stimulus,
      input_mode: trial.input_mode,
      ratings: this.ratingsHistory,
      video_duration: Math.round(this.videoDuration),
      mean_rating: Math.round(mean * 100) / 100,
      std_rating: Math.round(std * 100) / 100,
      min_rating: minVal,
      max_rating: maxVal,
      final_rating: this.currentValue,
      num_samples: this.ratingsHistory.length,
      rt: performance.now() - this.startTime,
    };

    // Clear display
    this.jsPsych.finishTrial(trialData);
  }
}

export default VideoArousalRatingPlugin;
