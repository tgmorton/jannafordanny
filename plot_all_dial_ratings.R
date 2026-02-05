#!/usr/bin/env Rscript
#
# Cross-participant analysis and visualization from aggregated CSVs.
#
# Produces:
#   1. grand_mean_by_condition.png   -- Grand mean trajectory +/- 1 SE across participants
#   2. per_participant_mean_by_condition.png -- Faceted by PID, mean trajectory per condition
#   3. all_traces_by_participant.png -- All individual trial traces, faceted by participant
#   4. discrete_ratings_by_condition.png -- Grouped bar chart of mean discrete ratings by condition
#   5. participant_summary.csv       -- Participant x condition summary table
#   6. aggregate_summary.csv         -- Grand means + SE per condition x rating measure
#
# Usage:
#   Rscript plot_all_dial_ratings.R [dial_csv] [ratings_csv] [output_dir]
#
# Defaults: all_dial_ratings.csv, all_ratings.csv, all_plots

library(tidyverse)
library(ggplot2)

# Parse command line arguments
args <- commandArgs(trailingOnly = TRUE)

dial_file <- if (length(args) >= 1) args[1] else "all_dial_ratings.csv"
ratings_file <- if (length(args) >= 2) args[2] else "all_ratings.csv"
output_dir <- if (length(args) >= 3) args[3] else "all_plots"

if (!dir.exists(output_dir)) {
  dir.create(output_dir, recursive = TRUE)
}

# Color palette for conditions
condition_colors <- c(
  "neutral" = "#1a7f37",
  "observatory" = "#0969da",
  "participatory" = "#cf222e"
)

# ============================================================
# Part A: Dial ratings analysis
# ============================================================

cat("Reading dial ratings:", dial_file, "\n")
dial_data <- read_csv(dial_file, show_col_types = FALSE)

ts_cols <- names(dial_data)[grepl("^ts_", names(dial_data))]

# Convert to long format
dial_long <- dial_data %>%
  select(PID, trial_number, trial_index, block, block_type, trial_type, video, baseline, mean, all_of(ts_cols)) %>%
  pivot_longer(
    cols = all_of(ts_cols),
    names_to = "timestamp",
    values_to = "dial_value"
  ) %>%
  mutate(
    time_index = as.numeric(gsub("ts_", "", timestamp)),
    time_sec = (time_index - 1) * 0.01,
    condition = ifelse(block_type == "", "nature", block_type),
    PID = as.character(PID)
  ) %>%
  filter(!is.na(dial_value) & dial_value != "")

dial_long$dial_value <- as.numeric(dial_long$dial_value)

# Cut off dial data after 150 seconds for plots
dial_long <- dial_long %>% filter(time_sec <= 150)

# Exclude nature trials from cross-participant condition comparisons
dial_main <- dial_long %>% filter(condition != "nature")

cat("Dial data:", nrow(dial_data), "trials,", length(unique(dial_data$PID)), "participants\n")
cat("Conditions (excluding nature):", paste(unique(dial_main$condition), collapse = ", "), "\n\n")

# --- Plot 1: Grand mean by condition (two-level aggregation) ---
# First average trials within participant x condition x time, then across participants
participant_means <- dial_main %>%
  group_by(PID, condition, time_index, time_sec) %>%
  summarize(mean_dial = mean(dial_value, na.rm = TRUE), .groups = "drop")

grand_means <- participant_means %>%
  group_by(condition, time_index, time_sec) %>%
  summarize(
    grand_mean = mean(mean_dial, na.rm = TRUE),
    se = sd(mean_dial, na.rm = TRUE) / sqrt(n()),
    .groups = "drop"
  )

p_grand <- ggplot(grand_means, aes(x = time_sec, y = grand_mean, color = condition, fill = condition)) +
  geom_ribbon(aes(ymin = grand_mean - se, ymax = grand_mean + se), alpha = 0.2, color = NA) +
  geom_line(linewidth = 1) +
  scale_color_manual(values = condition_colors, name = "Condition") +
  scale_fill_manual(values = condition_colors, name = "Condition") +
  scale_y_continuous(limits = c(0, 10), breaks = 0:10) +
  labs(
    title = "Grand Mean Dial Ratings by Condition",
    subtitle = paste0("N = ", length(unique(dial_main$PID)), " participants | Shaded area = \u00b11 SE across participants"),
    x = "Time (seconds)",
    y = "Mean Arousal Rating"
  ) +
  theme_minimal() +
  theme(
    legend.position = "bottom",
    panel.grid.minor = element_blank()
  )

ggsave(file.path(output_dir, "grand_mean_by_condition.png"), p_grand, width = 12, height = 6, dpi = 150)
cat("Saved: grand_mean_by_condition.png\n")

# --- Plot 2: Per-participant mean by condition ---
p_per_participant <- ggplot(participant_means, aes(x = time_sec, y = mean_dial, color = condition)) +
  geom_line(linewidth = 0.7, alpha = 0.8) +
  scale_color_manual(values = condition_colors, name = "Condition") +
  scale_y_continuous(limits = c(0, 10), breaks = seq(0, 10, 2)) +
  facet_wrap(~PID, ncol = 2) +
  labs(
    title = "Mean Dial Ratings by Condition per Participant",
    x = "Time (seconds)",
    y = "Mean Arousal Rating"
  ) +
  theme_minimal() +
  theme(
    legend.position = "bottom",
    panel.grid.minor = element_blank()
  )

ggsave(file.path(output_dir, "per_participant_mean_by_condition.png"), p_per_participant, width = 12, height = 8, dpi = 150)
cat("Saved: per_participant_mean_by_condition.png\n")

# --- Plot 3: All individual traces faceted by participant ---
p_traces <- ggplot(dial_main, aes(x = time_sec, y = dial_value, color = condition,
                                   group = interaction(PID, trial_number))) +
  geom_line(alpha = 0.4, linewidth = 0.3) +
  scale_color_manual(values = condition_colors, name = "Condition") +
  scale_y_continuous(limits = c(0, 10), breaks = seq(0, 10, 2)) +
  facet_wrap(~PID, ncol = 2) +
  labs(
    title = "All Individual Trial Traces by Participant",
    x = "Time (seconds)",
    y = "Arousal Rating"
  ) +
  theme_minimal() +
  theme(
    legend.position = "bottom",
    panel.grid.minor = element_blank()
  )

ggsave(file.path(output_dir, "all_traces_by_participant.png"), p_traces, width = 12, height = 8, dpi = 150)
cat("Saved: all_traces_by_participant.png\n")

# ============================================================
# Part B: Discrete ratings analysis
# ============================================================

cat("\nReading discrete ratings:", ratings_file, "\n")
ratings_data <- read_csv(ratings_file, show_col_types = FALSE) %>%
  mutate(
    condition = ifelse(block_type == "", "nature", block_type),
    PID = as.character(PID)
  )

# Exclude nature and practice trials from condition comparisons
ratings_main <- ratings_data %>% filter(condition != "nature", trial_type == "main")

cat("Discrete ratings:", nrow(ratings_data), "trials,", length(unique(ratings_data$PID)), "participants\n")

# Pivot discrete ratings to long format for grouped plotting
ratings_long <- ratings_main %>%
  select(PID, trial_number, condition, arousal, pleasure, distraction, immersion) %>%
  pivot_longer(
    cols = c(arousal, pleasure, distraction, immersion),
    names_to = "measure",
    values_to = "value"
  ) %>%
  mutate(value = as.numeric(value))

# --- Output 5: participant_summary.csv ---
participant_summary <- ratings_long %>%
  group_by(PID, condition, measure) %>%
  summarize(mean_value = mean(value, na.rm = TRUE), .groups = "drop") %>%
  pivot_wider(names_from = measure, values_from = mean_value)

write_csv(participant_summary, file.path(output_dir, "participant_summary.csv"))
cat("Saved: participant_summary.csv\n")

# --- Output 6: aggregate_summary.csv ---
# First average within participant x condition, then across participants
participant_condition <- ratings_long %>%
  group_by(PID, condition, measure) %>%
  summarize(mean_value = mean(value, na.rm = TRUE), .groups = "drop")

aggregate_summary <- participant_condition %>%
  group_by(condition, measure) %>%
  summarize(
    grand_mean = mean(mean_value, na.rm = TRUE),
    se = sd(mean_value, na.rm = TRUE) / sqrt(n()),
    n = n(),
    .groups = "drop"
  )

write_csv(aggregate_summary, file.path(output_dir, "aggregate_summary.csv"))
cat("Saved: aggregate_summary.csv\n")

# --- Plot 4: Grouped bar chart of discrete ratings by condition ---
p_discrete <- ggplot(aggregate_summary, aes(x = measure, y = grand_mean, fill = condition)) +
  geom_col(position = position_dodge(width = 0.8), width = 0.7) +
  geom_errorbar(
    aes(ymin = grand_mean - se, ymax = grand_mean + se),
    position = position_dodge(width = 0.8),
    width = 0.25
  ) +
  scale_fill_manual(values = condition_colors, name = "Condition") +
  labs(
    title = "Mean Discrete Ratings by Condition",
    subtitle = paste0("N = ", length(unique(ratings_main$PID)), " participants | Error bars = \u00b11 SE across participants"),
    x = "Rating Measure",
    y = "Mean Rating"
  ) +
  theme_minimal() +
  theme(
    legend.position = "bottom",
    panel.grid.minor = element_blank()
  )

ggsave(file.path(output_dir, "discrete_ratings_by_condition.png"), p_discrete, width = 10, height = 6, dpi = 150)
cat("Saved: discrete_ratings_by_condition.png\n")

# ============================================================
# Part C: Per-participant dial plots (individual trial traces)
# ============================================================

cat("\nGenerating per-participant dial plots...\n")
participant_dir <- file.path(output_dir, "per_participant")
if (!dir.exists(participant_dir)) dir.create(participant_dir, recursive = TRUE)

# Include all conditions (including nature) for descriptive per-participant plots
condition_colors_all <- c(condition_colors, "nature" = "#666666")

for (pid in unique(dial_long$PID)) {
  pid_data <- dial_long %>% filter(PID == pid)
  pid_wide <- dial_data %>% filter(as.character(PID) == pid)

  p_pid <- ggplot(pid_data, aes(x = time_sec, y = dial_value, color = condition, group = trial_number)) +
    geom_line(alpha = 0.6, linewidth = 0.5) +
    scale_color_manual(values = condition_colors_all, name = "Condition") +
    scale_y_continuous(limits = c(0, 10), breaks = 0:10) +
    labs(
      title = paste0("All Dial Traces - Participant ", pid),
      subtitle = paste0(nrow(pid_wide), " trials"),
      x = "Time (seconds)",
      y = "Arousal Rating"
    ) +
    theme_minimal() +
    theme(legend.position = "bottom", panel.grid.minor = element_blank())

  ggsave(file.path(participant_dir, paste0("participant_", pid, "_all_traces.png")),
         p_pid, width = 12, height = 6, dpi = 150)

  # Also faceted by condition
  p_pid_facet <- ggplot(pid_data, aes(x = time_sec, y = dial_value, color = condition, group = trial_number)) +
    geom_line(alpha = 0.7, linewidth = 0.5) +
    scale_color_manual(values = condition_colors_all, name = "Condition") +
    scale_y_continuous(limits = c(0, 10), breaks = seq(0, 10, 2)) +
    facet_wrap(~condition, ncol = 2) +
    labs(
      title = paste0("Dial Traces by Condition - Participant ", pid),
      x = "Time (seconds)",
      y = "Arousal Rating"
    ) +
    theme_minimal() +
    theme(legend.position = "none", panel.grid.minor = element_blank())

  ggsave(file.path(participant_dir, paste0("participant_", pid, "_by_condition.png")),
         p_pid_facet, width = 12, height = 8, dpi = 150)

  cat("Saved: participant", pid, "plots\n")
}

# ============================================================
# Part D: Per-video dial plots (all participants overlaid)
# ============================================================

cat("\nGenerating per-video dial plots...\n")
video_dir <- file.path(output_dir, "per_video")
if (!dir.exists(video_dir)) dir.create(video_dir, recursive = TRUE)

# Color palette for participants
pid_list <- sort(unique(dial_long$PID))
pid_colors <- setNames(
  c("#e41a1c", "#377eb8", "#4daf4a", "#984ea3", "#ff7f00", "#a65628")[1:length(pid_list)],
  pid_list
)

for (v in unique(dial_long$video)) {
  video_data <- dial_long %>% filter(video == v)
  video_condition <- video_data$condition[1]
  clean_name <- gsub("\\.mp4$", "", v)

  p_video <- ggplot(video_data, aes(x = time_sec, y = dial_value, color = PID, group = interaction(PID, trial_number))) +
    geom_line(alpha = 0.7, linewidth = 0.6) +
    scale_color_manual(values = pid_colors, name = "Participant") +
    scale_y_continuous(limits = c(0, 10), breaks = 0:10) +
    labs(
      title = paste0("Dial Traces: ", v),
      subtitle = paste0("Condition: ", video_condition, " | ", length(unique(video_data$PID)), " participants"),
      x = "Time (seconds)",
      y = "Arousal Rating"
    ) +
    theme_minimal() +
    theme(legend.position = "bottom", panel.grid.minor = element_blank())

  ggsave(file.path(video_dir, paste0("video_", clean_name, ".png")),
         p_video, width = 12, height = 6, dpi = 150)
  cat("Saved: video_", clean_name, ".png\n", sep = "")
}

# ============================================================
# Part E: Arousal ratings per video (bar chart)
# ============================================================

cat("\nGenerating arousal by video chart...\n")

# Use all ratings (including nature) for per-video view
ratings_all <- read_csv(ratings_file, show_col_types = FALSE) %>%
  mutate(
    condition = ifelse(block_type == "", "nature", block_type),
    PID = as.character(PID),
    arousal = as.numeric(arousal)
  ) %>%
  filter(!is.na(arousal))

# Exclude practice trials; aggregate across all participants regardless of condition
# (videos are counterbalanced across conditions, so condition is not a video property)
arousal_by_video <- ratings_all %>%
  filter(trial_type != "practice") %>%
  group_by(video) %>%
  summarize(
    mean_arousal = mean(arousal, na.rm = TRUE),
    se_arousal = sd(arousal, na.rm = TRUE) / sqrt(n()),
    n = n(),
    .groups = "drop"
  ) %>%
  mutate(video_label = gsub("\\.mp4$", "", video))

p_arousal_video <- ggplot(arousal_by_video,
    aes(x = reorder(video_label, mean_arousal), y = mean_arousal)) +
  geom_col(fill = "#4a90d9", width = 0.7) +
  geom_errorbar(aes(ymin = mean_arousal - se_arousal, ymax = mean_arousal + se_arousal), width = 0.25) +
  scale_y_continuous(limits = c(0, 10), breaks = 0:10) +
  coord_flip() +
  labs(
    title = "Mean Arousal Rating by Video",
    subtitle = paste0("N = ", length(unique(ratings_all$PID)), " participants | Error bars = \u00b11 SE"),
    x = NULL,
    y = "Mean Arousal Rating"
  ) +
  theme_minimal() +
  theme(panel.grid.minor = element_blank())

ggsave(file.path(output_dir, "arousal_by_video.png"), p_arousal_video, width = 10, height = 8, dpi = 150)
cat("Saved: arousal_by_video.png\n")

cat("\nAll outputs saved to:", output_dir, "\n")
