import { JsPsych, JsPsychPlugin, ParameterType, TrialType } from "jspsych";

const info = {
  name: "video-dial-rating",
  parameters: {
    /** Video file(s) to play */
    stimulus: {
      type: ParameterType.VIDEO,
      default: undefined,
      array: true,
    },
    /** Width of the video in pixels or "100%" for fullscreen */
    video_width: {
      type: ParameterType.STRING,
      default: "800",
    },
    /** Height of the video in pixels or "100%" for fullscreen */
    video_height: {
      type: ParameterType.STRING,
      default: "600",
    },
    /** Whether to use fullscreen video with dial overlay */
    fullscreen: {
      type: ParameterType.BOOL,
      default: false,
    },
    /** Whether to autoplay the video */
    autoplay: {
      type: ParameterType.BOOL,
      default: true,
    },
    /** Minimum value of the dial */
    dial_min: {
      type: ParameterType.INT,
      default: 0,
    },
    /** Maximum value of the dial */
    dial_max: {
      type: ParameterType.INT,
      default: 10,
    },
    /** Starting value of the dial */
    dial_start: {
      type: ParameterType.INT,
      default: 5,
    },
    /** Sampling rate in milliseconds */
    sample_rate_ms: {
      type: ParameterType.INT,
      default: 100,
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
    /** Whether to show trail visualization (debug mode) */
    show_trail: {
      type: ParameterType.BOOL,
      default: false,
    },
    /** Color of the trail line */
    trail_color: {
      type: ParameterType.STRING,
      default: "rgba(70, 130, 180, 1)",
    },
    /** Countdown seconds before video starts for baseline setting */
    countdown_duration: {
      type: ParameterType.INT,
      default: 10,
    },
  },
};

class VideoDialRatingPlugin {
  static info = info;

  constructor(jsPsych) {
    this.jsPsych = jsPsych;
  }

  trial(display_element, trial) {
    console.log("VideoDialRatingPlugin trial started");
    console.log("Trial stimulus:", trial.stimulus);
    console.log("Trial params:", trial);

    // State variables
    this.currentValue = trial.dial_start;
    this.dialMin = trial.dial_min;
    this.dialMax = trial.dial_max;
    this.ratingsHistory = [];
    this.startTime = performance.now();
    this.videoDuration = 0;
    this.samplingInterval = null;
    this.videoStarted = false;
    this.isRecording = false;

    // Dial angle mapping: 0 = 225° (bottom-left), 10 = -45° (bottom-right)
    // This is a 270° arc, so each unit is 27°
    this.angleStart = 225; // angle for value 0
    this.angleEnd = -45; // angle for value 10
    this.angleRange = this.angleStart - this.angleEnd; // 270 degrees

    // Hide cursor globally
    document.body.style.cursor = "none";

    // Determine if fullscreen mode
    const isFullscreen = trial.fullscreen === true;
    const videoWidth = isFullscreen ? "100vw" : (typeof trial.video_width === 'string' && trial.video_width.includes('%') ? trial.video_width : trial.video_width + "px");
    const videoHeight = isFullscreen ? "100vh" : (typeof trial.video_height === 'string' && trial.video_height.includes('%') ? trial.video_height : trial.video_height + "px");

    // Build the HTML
    let html = `
      <style>
        #dial-video-container {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0px;
          cursor: none;
          ${isFullscreen ? 'position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: #000;' : ''}
        }
        #dial-container {
          position: ${isFullscreen ? 'fixed' : 'relative'};
          ${isFullscreen ? 'top: 20px; left: 50%; transform: translateX(-50%); z-index: 100;' : ''}
          width: 150px;
          height: 150px;
          ${isFullscreen ? '' : 'margin: 10px 0;'}
          ${isFullscreen ? 'border: 3px solid white; border-radius: 50%; box-shadow: 0 4px 15px rgba(0,0,0,0.5);' : ''}
        }
        #dial-svg {
          width: 100%;
          height: 100%;
        }
        #dial-pointer {
          transform-origin: 150px 150px;
          /* transition removed for smoother updates */
        }
        #video-wrapper {
          position: relative;
          display: flex;
          flex-direction: row;
          align-items: ${isFullscreen ? 'center' : 'flex-start'};
          justify-content: center;
          ${isFullscreen ? 'width: 100vw; height: 100vh;' : ''}
        }
        #trail-container {
          margin-right: 10px;
        }
        #video-container {
          position: relative;
          width: ${isFullscreen ? '100vw' : videoWidth};
          height: ${isFullscreen ? '100vh' : videoHeight};
        }
        #jspsych-video-dial-video {
          ${isFullscreen ? 'width: 100vw; height: 100vh; object-fit: contain;' : ''}
        }
        #video-overlay {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: rgba(50, 50, 50, 0.9);
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          z-index: 10;
        }
        #overlay-text {
          color: white;
          font-size: 24px;
          text-align: center;
          max-width: 80%;
          line-height: 1.5;
        }
        #countdown-number {
          color: white;
          font-size: 72px;
          font-weight: bold;
          margin-top: 20px;
        }
        * {
          cursor: none !important;
        }
      </style>
      <div id="dial-video-container">
        ${isFullscreen ? '' : '<div id="dial-container">'}
        ${isFullscreen ? '<div id="dial-container">' : ''}
          <svg id="dial-svg" width="300" height="300" viewBox="0 0 300 300" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <radialGradient id="knobGradient" cx="50%" cy="50%" r="50%" fx="50%" fy="50%">
                <stop offset="0%" style="stop-color:#444;stop-opacity:1" />
                <stop offset="85%" style="stop-color:#111;stop-opacity:1" />
                <stop offset="100%" style="stop-color:#000;stop-opacity:1" />
              </radialGradient>
              <filter id="dropShadow" height="130%">
                <feGaussianBlur in="SourceAlpha" stdDeviation="3"/>
                <feOffset dx="2" dy="2" result="offsetblur"/>
                <feComponentTransfer>
                  <feFuncA type="linear" slope="0.5"/>
                </feComponentTransfer>
                <feMerge>
                  <feMergeNode/>
                  <feMergeNode in="SourceGraphic"/>
                </feMerge>
              </filter>
            </defs>

            <!-- Base Circle (The Dial Face) -->
            <circle cx="150" cy="150" r="145" fill="#050505" stroke="#333" stroke-width="2" />

            <!-- Ticks -->
            <g>
              <line x1="58.1" y1="241.9" x2="68.7" y2="231.3" stroke="white" stroke-width="3" stroke-linecap="round" />
              <line x1="39.2" y1="217.9" x2="46.0" y2="213.7" stroke="rgba(255,255,255,0.6)" stroke-width="1.5" stroke-linecap="round" />
              <line x1="26.4" y1="190.2" x2="40.6" y2="185.5" stroke="white" stroke-width="3" stroke-linecap="round" />
              <line x1="20.4" y1="160.2" x2="28.4" y2="159.6" stroke="rgba(255,255,255,0.6)" stroke-width="1.5" stroke-linecap="round" />
              <line x1="21.6" y1="129.7" x2="36.4" y2="132.0" stroke="white" stroke-width="3" stroke-linecap="round" />
              <line x1="29.9" y1="100.3" x2="37.3" y2="103.3" stroke="rgba(255,255,255,0.6)" stroke-width="1.5" stroke-linecap="round" />
              <line x1="44.8" y1="73.6" x2="57.0" y2="82.4" stroke="white" stroke-width="3" stroke-linecap="round" />
              <line x1="65.6" y1="51.1" x2="70.8" y2="57.2" stroke="rgba(255,255,255,0.6)" stroke-width="1.5" stroke-linecap="round" />
              <line x1="91.0" y1="34.2" x2="97.8" y2="47.5" stroke="white" stroke-width="3" stroke-linecap="round" />
              <line x1="119.7" y1="23.6" x2="121.5" y2="31.4" stroke="rgba(255,255,255,0.6)" stroke-width="1.5" stroke-linecap="round" />
              <line x1="150.0" y1="20.0" x2="150.0" y2="35.0" stroke="white" stroke-width="3" stroke-linecap="round" />
              <line x1="180.3" y1="23.6" x2="178.5" y2="31.4" stroke="rgba(255,255,255,0.6)" stroke-width="1.5" stroke-linecap="round" />
              <line x1="209.0" y1="34.2" x2="202.2" y2="47.5" stroke="white" stroke-width="3" stroke-linecap="round" />
              <line x1="234.4" y1="51.1" x2="229.2" y2="57.2" stroke="rgba(255,255,255,0.6)" stroke-width="1.5" stroke-linecap="round" />
              <line x1="255.2" y1="73.6" x2="243.0" y2="82.4" stroke="white" stroke-width="3" stroke-linecap="round" />
              <line x1="270.1" y1="100.3" x2="262.7" y2="103.3" stroke="rgba(255,255,255,0.6)" stroke-width="1.5" stroke-linecap="round" />
              <line x1="278.4" y1="129.7" x2="263.6" y2="132.0" stroke="white" stroke-width="3" stroke-linecap="round" />
              <line x1="279.6" y1="160.2" x2="271.6" y2="159.6" stroke="rgba(255,255,255,0.6)" stroke-width="1.5" stroke-linecap="round" />
              <line x1="273.6" y1="190.2" x2="259.4" y2="185.5" stroke="white" stroke-width="3" stroke-linecap="round" />
              <line x1="260.8" y1="217.9" x2="254.0" y2="213.7" stroke="rgba(255,255,255,0.6)" stroke-width="1.5" stroke-linecap="round" />
              <line x1="241.9" y1="241.9" x2="231.3" y2="231.3" stroke="white" stroke-width="3" stroke-linecap="round" />
            </g>

            <!-- Numbers -->
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

            <!-- Central Knob Body -->
            <circle cx="150" cy="150" r="75" fill="#222" stroke="#111" stroke-width="1" filter="url(#dropShadow)" />
            <circle cx="150" cy="150" r="65" fill="url(#knobGradient)" stroke="#000" stroke-width="2" />
            <circle cx="150" cy="150" r="60" fill="none" stroke="#333" stroke-width="1" opacity="0.5" />

            <!-- Pointer Line (this rotates) -->
            <g id="dial-pointer">
              <line x1="150" y1="130" x2="150" y2="95" stroke="white" stroke-width="4" stroke-linecap="round" />
            </g>
          </svg>
        </div>

        <div id="video-wrapper">
          ${
            trial.show_trail
              ? `<div id="trail-container">
            <canvas id="dial-trail-canvas" width="200" height="${isFullscreen ? '600' : trial.video_height}" style="background: #1a1a1a; border: 1px solid #333;"></canvas>
          </div>`
              : ""
          }
          <div id="video-container">
            <div id="video-overlay">
              <div id="overlay-text">Set the dial to your current baseline level of arousal</div>
              <div id="countdown-number">${trial.countdown_duration}</div>
            </div>
            <video id="jspsych-video-dial-video"
                   ${isFullscreen ? '' : 'width="' + trial.video_width + '" height="' + trial.video_height + '"'}
                   playsinline>`;

    for (const src of trial.stimulus) {
      const type = src.toLowerCase().endsWith(".webm")
        ? "video/webm"
        : src.toLowerCase().endsWith(".mov")
          ? "video/quicktime"
          : "video/mp4";
      html += `<source src="${src}" type="${type}">`;
    }

    html += `</video>
          </div>
        </div>
      </div>
    `;

    if (trial.prompt !== null) {
      html += `<div id="dial-prompt">${trial.prompt}</div>`;
    }

    console.log("Setting display_element.innerHTML");
    display_element.innerHTML = html;
    console.log("HTML set, display_element:", display_element);

    // Get element references
    this.video = display_element.querySelector("#jspsych-video-dial-video");
    console.log("Video element:", this.video);
    console.log(
      "Video sources:",
      this.video ? this.video.innerHTML : "no video element",
    );
    this.dialPointer = display_element.querySelector("#dial-pointer");
    this.canvas = trial.show_trail
      ? display_element.querySelector("#dial-trail-canvas")
      : null;
    this.ctx = this.canvas ? this.canvas.getContext("2d") : null;
    this.showTrail = trial.show_trail;
    this.overlay = display_element.querySelector("#video-overlay");
    this.countdownNumber = display_element.querySelector("#countdown-number");

    // Initialize dial position
    this.updateDialDisplay();

    // Setup video event handlers
    this.video.addEventListener("loadedmetadata", () => {
      console.log("Video metadata loaded, duration:", this.video.duration);
      this.videoDuration = this.video.duration * 1000;
    });

    this.video.addEventListener("error", (e) => {
      console.log("Video error event:", this.video.error);
    });

    this.video.addEventListener("canplay", () => {
      console.log("Video can play");
    });

    this.video.addEventListener("play", () => {
      this.videoStarted = true;
      this.isRecording = true;
      this.videoPlayStartTime = performance.now();
      this.startDataSampling(trial);
    });

    this.video.addEventListener("ended", () => {
      this.isRecording = false;
      if (trial.trial_ends_after_video) {
        this.endTrial(trial);
      }
    });

    // Setup trackpad input (works during countdown too)
    this.setupTrackpadInput(trial);

    // Start countdown before video plays
    this.startCountdown(trial);
  }

  startCountdown(trial) {
    console.log("Starting countdown:", trial.countdown_duration, "seconds");
    let secondsLeft = trial.countdown_duration;

    const countdownInterval = setInterval(() => {
      secondsLeft--;
      console.log("Countdown:", secondsLeft);
      if (this.countdownNumber) {
        this.countdownNumber.textContent = secondsLeft;
      }

      if (secondsLeft <= 0) {
        clearInterval(countdownInterval);
        // Record baseline value
        this.baselineValue = this.currentValue;
        console.log("Baseline value recorded:", this.baselineValue);
        // Hide overlay
        if (this.overlay) {
          this.overlay.style.display = "none";
        }
        // Start video
        console.log("Video readyState:", this.video.readyState);
        console.log("Video networkState:", this.video.networkState);
        console.log("Video error:", this.video.error);
        this.video.play().catch((e) => {
          console.log("Video play failed:", e);
        });
      }
    }, 1000);
  }

  valueToAngle(value) {
    // Map value (0-10) to angle (225 to -45 degrees)
    // 0 -> 225°, 10 -> -45°
    const normalized = (value - this.dialMin) / (this.dialMax - this.dialMin);
    const angle = this.angleStart - normalized * this.angleRange;
    return angle;
  }

  updateDialDisplay() {
    const angle = this.valueToAngle(this.currentValue);
    // SVG rotation: 0° is pointing right, we need to offset since pointer points up by default
    // Pointer at value 5 should point straight up (which is -90° in SVG coordinates)
    // At value 5, our angle is 90° (halfway between 225 and -45)
    // We need to rotate from the default "up" position
    // Default pointer is at -90° (pointing up), so rotation = angle - 90
    const rotation = angle - 90;
    this.dialPointer.style.transform = `rotate(${-rotation}deg)`;
  }

  updateDialValue(newValue) {
    this.currentValue = Math.max(
      this.dialMin,
      Math.min(this.dialMax, newValue),
    );
    this.updateDialDisplay();
  }

  recordEvent(eventType) {
    if (!this.isRecording) return;

    const timestamp = this.video ? this.video.currentTime * 1000 : 0;
    this.ratingsHistory.push({
      timestamp: Math.round(timestamp),
      value: Math.round(this.currentValue * 10) / 10,
      event: eventType,
    });
  }

  startDataSampling(trial) {
    if (this.samplingInterval) {
      clearInterval(this.samplingInterval);
    }

    // Monitor broadcasting (throttled to 500ms)
    let lastMonitorBroadcast = 0;
    const monitorBroadcastInterval = 500; // ms

    this.samplingInterval = setInterval(() => {
      if (this.isRecording) {
        this.recordEvent("sample");

        // Broadcast to monitor (throttled)
        const now = performance.now();
        if (now - lastMonitorBroadcast >= monitorBroadcastInterval) {
          lastMonitorBroadcast = now;
          if (window.__experimentMonitor && window.__experimentMonitor.sendMonitorUpdate) {
            window.__experimentMonitor.sendMonitorUpdate({
              type: 'dial_value',
              value: Math.round(this.currentValue * 10) / 10,
            });
          }
        }
      }
      if (this.showTrail && this.canvas) {
        this.drawTrail(trial);
      }
    }, trial.sample_rate_ms);
  }

  drawTrail(trial) {
    if (!this.ctx || !this.canvas) return;

    const width = this.canvas.width;
    const height = this.canvas.height;
    const duration = this.videoDuration || 60000;

    // Clear canvas
    this.ctx.clearRect(0, 0, width, height);

    // Draw background grid
    this.ctx.strokeStyle = "#333";
    this.ctx.lineWidth = 1;
    for (let i = 0; i <= 10; i++) {
      const y = (i / 10) * height;
      this.ctx.beginPath();
      this.ctx.moveTo(0, y);
      this.ctx.lineTo(width, y);
      this.ctx.stroke();
    }

    // Draw rating history line
    if (this.ratingsHistory.length > 1) {
      this.ctx.beginPath();
      this.ctx.strokeStyle = trial.trail_color;
      this.ctx.lineWidth = 2.5;

      for (let i = 0; i < this.ratingsHistory.length; i++) {
        const point = this.ratingsHistory[i];
        const x = (point.timestamp / duration) * width;
        const normalizedValue =
          (point.value - this.dialMin) / (this.dialMax - this.dialMin);
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
      const currentX = ((this.video.currentTime * 1000) / duration) * width;
      this.ctx.strokeStyle = "#ff4444";
      this.ctx.lineWidth = 2;
      this.ctx.beginPath();
      this.ctx.moveTo(currentX, 0);
      this.ctx.lineTo(currentX, height);
      this.ctx.stroke();
    }
  }

  setupTrackpadInput(trial) {
    // Track vertical mouse/touch position to control dial
    // Top of window = 10, bottom = 0
    // Using middle 40% of screen for full range (doubled sensitivity)

    const calculateValueFromPosition = (clientY) => {
      const windowHeight = window.innerHeight;
      const margin = windowHeight * 0.3; // 30% margin top/bottom = 40% usable (2x sensitivity)
      const usableHeight = windowHeight - margin * 2;

      if (clientY <= margin) {
        return this.dialMax; // Top = 10
      }
      if (clientY >= windowHeight - margin) {
        return this.dialMin; // Bottom = 0
      }

      const positionInUsable = clientY - margin;
      // Invert: top = high value, bottom = low value
      const normalizedPosition = 1 - positionInUsable / usableHeight;

      const range = this.dialMax - this.dialMin;
      return this.dialMin + normalizedPosition * range;
    };

    const handleMove = (e) => {
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      const newValue = calculateValueFromPosition(clientY);
      this.updateDialValue(newValue);
    };

    // Skip key handler (R only - for RA use) and debug toggle
    const keyHandler = (e) => {
      if (e.key === "r" || e.key === "R") {
        e.preventDefault();
        this.endTrial(trial);
      }
      // Toggle debug trail with '[' key
      if (e.key === "[") {
        e.preventDefault();
        this.showTrail = !this.showTrail;
        const trailContainer = document.getElementById("trail-container");
        if (this.showTrail && !trailContainer) {
          // Create trail canvas dynamically
          const videoWrapper = document.getElementById("video-wrapper");
          const container = document.createElement("div");
          container.id = "trail-container";
          container.innerHTML = `<canvas id="dial-trail-canvas" width="200" height="${trial.video_height}" style="background: #1a1a1a; border: 1px solid #333;"></canvas>`;
          videoWrapper.insertBefore(container, videoWrapper.firstChild);
          this.canvas = document.getElementById("dial-trail-canvas");
          this.ctx = this.canvas.getContext("2d");
        } else if (!this.showTrail && trailContainer) {
          trailContainer.remove();
          this.canvas = null;
          this.ctx = null;
        }
      }
    };

    // Touch events
    document.addEventListener("touchmove", handleMove, { passive: true });

    // Mouse events
    document.addEventListener("mousemove", handleMove);

    // Keyboard for skip and debug
    document.addEventListener("keydown", keyHandler);

    // Store for cleanup
    this.cleanupHandlers = () => {
      document.removeEventListener("touchmove", handleMove);
      document.removeEventListener("mousemove", handleMove);
      document.removeEventListener("keydown", keyHandler);
    };
  }

  endTrial(trial) {
    if (this.samplingInterval) {
      clearInterval(this.samplingInterval);
    }

    if (this.cleanupHandlers) {
      this.cleanupHandlers();
    }

    // Restore cursor
    document.body.style.cursor = "auto";

    // Calculate summary statistics
    const values = this.ratingsHistory.map((r) => r.value);
    let mean = 0,
      std = 0,
      minVal = 0,
      maxVal = 0;

    if (values.length > 0) {
      mean = values.reduce((a, b) => a + b, 0) / values.length;
      const variance =
        values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) /
        values.length;
      std = Math.sqrt(variance);
      minVal = Math.min(...values);
      maxVal = Math.max(...values);
    }

    const trialData = {
      stimulus: trial.stimulus,
      baseline_rating: this.baselineValue,
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

    this.jsPsych.finishTrial(trialData);
  }
}

export default VideoDialRatingPlugin;
