#!/usr/bin/env Rscript
#
# Plot continuous dial ratings for each video trial
# Color-coded by condition (block_type)
#
# Usage:
#   Rscript plot_dial_ratings.R <input_csv> [output_dir]
#
# If output_dir is not specified, plots are saved to "dial_plots/"

library(tidyverse)
library(ggplot2)

# Parse command line arguments
args <- commandArgs(trailingOnly = TRUE)

if (length(args) < 1) {
  cat("Usage: Rscript plot_dial_ratings.R <input_csv> [output_dir]\n")
  quit(status = 1)
}

input_file <- args[1]
output_dir <- if (length(args) >= 2) args[2] else "dial_plots"

# Create output directory if it doesn't exist
if (!dir.exists(output_dir)) {
  dir.create(output_dir, recursive = TRUE)
}

# Read the data
data <- read_csv(input_file, show_col_types = FALSE)

# Get timestamp columns (ts_1, ts_2, etc.)
ts_cols <- names(data)[grepl("^ts_", names(data))]

# Color palette for conditions
condition_colors <- c(
  "neutral" = "#1a7f37",
  "observatory" = "#0969da",
  "participatory" = "#cf222e",
  "nature" = "#666666"
)

# Convert to long format for plotting
data_long <- data %>%
  select(PID, trial_number, trial_index, block, block_type, trial_type, video, baseline, mean, all_of(ts_cols)) %>%
  pivot_longer(
    cols = all_of(ts_cols),
    names_to = "timestamp",
    values_to = "dial_value"
  ) %>%
  mutate(
    # Extract numeric timestamp index
    time_index = as.numeric(gsub("ts_", "", timestamp)),
    # Convert to seconds (10ms sampling rate)
    time_sec = (time_index - 1) * 0.01,
    # Clean up block_type for display
    condition = ifelse(block_type == "", "nature", block_type)
  ) %>%
  filter(!is.na(dial_value) & dial_value != "")

# Convert dial_value to numeric
data_long$dial_value <- as.numeric(data_long$dial_value)

cat("Loaded", nrow(data), "trials\n")
cat("Creating plots...\n\n")

# Plot 1: All trials overlaid, colored by condition
p_all <- ggplot(data_long, aes(x = time_sec, y = dial_value, color = condition, group = trial_number)) +
  geom_line(alpha = 0.7, linewidth = 0.5) +
  scale_color_manual(values = condition_colors, name = "Condition") +
  scale_y_continuous(limits = c(0, 10), breaks = 0:10) +
  labs(
    title = paste("Continuous Dial Ratings - All Trials (PID:", unique(data$PID), ")"),
    x = "Time (seconds)",
    y = "Arousal Rating"
  ) +
  theme_minimal() +
  theme(
    legend.position = "bottom",
    panel.grid.minor = element_blank()
  )

ggsave(file.path(output_dir, "all_trials_overlay.png"), p_all, width = 12, height = 6, dpi = 150)
cat("Saved: all_trials_overlay.png\n")

# Plot 2: Faceted by condition
p_facet <- ggplot(data_long, aes(x = time_sec, y = dial_value, color = condition, group = trial_number)) +
  geom_line(alpha = 0.7, linewidth = 0.5) +
  scale_color_manual(values = condition_colors, name = "Condition") +
  scale_y_continuous(limits = c(0, 10), breaks = seq(0, 10, 2)) +
  facet_wrap(~condition, ncol = 2) +
  labs(
    title = paste("Continuous Dial Ratings by Condition (PID:", unique(data$PID), ")"),
    x = "Time (seconds)",
    y = "Arousal Rating"
  ) +
  theme_minimal() +
  theme(
    legend.position = "none",
    panel.grid.minor = element_blank()
  )

ggsave(file.path(output_dir, "trials_by_condition.png"), p_facet, width = 12, height = 8, dpi = 150)
cat("Saved: trials_by_condition.png\n")

# Plot 3: Individual trial plots
for (i in 1:nrow(data)) {
  trial_data <- data_long %>% filter(trial_number == data$trial_number[i])

  if (nrow(trial_data) == 0) next

  trial_info <- data[i, ]
  condition <- ifelse(is.na(trial_info$block_type) | trial_info$block_type == "", "nature", as.character(trial_info$block_type))
  line_color <- as.character(condition_colors[condition])

  p_trial <- ggplot(trial_data, aes(x = time_sec, y = dial_value)) +
    geom_line(color = line_color, linewidth = 0.8) +
    geom_hline(yintercept = as.numeric(trial_info$baseline), linetype = "dashed", color = "gray50", linewidth = 0.5) +
    geom_hline(yintercept = as.numeric(trial_info$mean), linetype = "dotted", color = "red", linewidth = 0.5) +
    scale_y_continuous(limits = c(0, 10), breaks = 0:10) +
    labs(
      title = paste0("Trial ", trial_info$trial_number, ": ", trial_info$video),
      subtitle = paste0("Condition: ", condition, " | Baseline: ", trial_info$baseline, " | Mean: ", round(as.numeric(trial_info$mean), 2)),
      x = "Time (seconds)",
      y = "Arousal Rating"
    ) +
    theme_minimal() +
    theme(panel.grid.minor = element_blank())

  filename <- sprintf("trial_%02d_%s.png", trial_info$trial_number, gsub("\\.mp4$", "", trial_info$video))
  ggsave(file.path(output_dir, filename), p_trial, width = 10, height = 5, dpi = 150)
  cat("Saved:", filename, "\n")
}

# Plot 4: Mean trajectory by condition
mean_by_condition <- data_long %>%
  group_by(condition, time_index, time_sec) %>%
  summarize(
    mean_dial = mean(dial_value, na.rm = TRUE),
    se_dial = sd(dial_value, na.rm = TRUE) / sqrt(n()),
    .groups = "drop"
  )

p_mean <- ggplot(mean_by_condition, aes(x = time_sec, y = mean_dial, color = condition, fill = condition)) +
  geom_ribbon(aes(ymin = mean_dial - se_dial, ymax = mean_dial + se_dial), alpha = 0.2, color = NA) +
  geom_line(linewidth = 1) +
  scale_color_manual(values = condition_colors, name = "Condition") +
  scale_fill_manual(values = condition_colors, name = "Condition") +
  scale_y_continuous(limits = c(0, 10), breaks = 0:10) +
  labs(
    title = paste("Mean Dial Ratings by Condition (PID:", unique(data$PID), ")"),
    subtitle = "Shaded area = ±1 SE",
    x = "Time (seconds)",
    y = "Mean Arousal Rating"
  ) +
  theme_minimal() +
  theme(
    legend.position = "bottom",
    panel.grid.minor = element_blank()
  )

ggsave(file.path(output_dir, "mean_by_condition.png"), p_mean, width = 12, height = 6, dpi = 150)
cat("Saved: mean_by_condition.png\n")

cat("\nAll plots saved to:", output_dir, "\n")
