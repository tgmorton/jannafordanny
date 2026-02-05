#!/usr/bin/env Rscript
#
# Compute Nakagawa & Schielzeth (2013) R² for mixed models
# Marginal R² = variance explained by fixed effects
# Conditional R² = variance explained by fixed + random effects
#
# Usage: Rscript effect_sizes.R [ratings_csv] [output_dir]

if (!require("MuMIn", quietly = TRUE)) {
  install.packages("MuMIn", repos = "https://cloud.r-project.org")
  library(MuMIn)
}

library(tidyverse)
library(lme4)
library(lmerTest)

args <- commandArgs(trailingOnly = TRUE)
ratings_file <- if (length(args) >= 1) args[1] else "all_ratings.csv"
output_dir <- if (length(args) >= 2) args[2] else "all_plots"

if (!dir.exists(output_dir)) dir.create(output_dir, recursive = TRUE)

ctrl <- lmerControl(optimizer = "bobyqa", optCtrl = list(maxfun = 1e5))

ratings <- read_csv(ratings_file, show_col_types = FALSE) %>%
  mutate(
    condition = ifelse(block_type == "", "nature", block_type),
    PID = as.factor(PID),
    video = as.factor(video)
  ) %>%
  filter(condition != "nature", trial_type == "main")

ratings$condition <- factor(ratings$condition, levels = c("neutral", "observatory", "participatory"))

measures <- c("arousal", "pleasure", "distraction", "immersion")

results <- list()

for (measure in measures) {
  cat("==============================================================\n")
  cat("MEASURE:", toupper(measure), "\n")
  cat("==============================================================\n\n")

  ratings$y <- as.numeric(ratings[[measure]])

  # Fit the best model (M1a)
  m1a <- lmer(y ~ condition + (1 | PID), data = ratings, REML = FALSE, control = ctrl)

  # Null model (intercept + random effect only, no condition)
  m_null <- lmer(y ~ 1 + (1 | PID), data = ratings, REML = FALSE, control = ctrl)

  # Nakagawa R²
  r2_vals <- r.squaredGLMM(m1a)
  r2_null <- r.squaredGLMM(m_null)

  cat("Best model: rating ~ condition + (1 | PID)\n\n")
  cat("Nakagawa & Schielzeth R²:\n")
  cat(sprintf("  Marginal R² (fixed effects only):     %.4f\n", r2_vals[1, "R2m"]))
  cat(sprintf("  Conditional R² (fixed + random):       %.4f\n", r2_vals[1, "R2c"]))
  cat(sprintf("\nNull model (intercept only + PID RE):\n"))
  cat(sprintf("  Marginal R²:                          %.4f\n", r2_null[1, "R2m"]))
  cat(sprintf("  Conditional R²:                       %.4f\n", r2_null[1, "R2c"]))

  # Delta R² -- how much does adding condition improve over null?
  delta_r2m <- r2_vals[1, "R2m"] - r2_null[1, "R2m"]
  cat(sprintf("\nDelta Marginal R² (condition effect):   %.4f\n", delta_r2m))

  # Variance decomposition
  vc <- as.data.frame(VarCorr(m1a))
  var_pid <- vc$vcov[vc$grp == "PID"]
  var_resid <- vc$vcov[vc$grp == "Residual"]
  var_total <- var_pid + var_resid

  # Fixed effects variance (variance of the predicted values from fixed effects)
  var_fixed <- var(predict(m1a, re.form = NA))

  cat(sprintf("\nVariance decomposition:\n"))
  cat(sprintf("  Fixed effects (condition):  %.3f (%.1f%%)\n", var_fixed, 100 * var_fixed / (var_fixed + var_pid + var_resid)))
  cat(sprintf("  PID (random intercept):     %.3f (%.1f%%)\n", var_pid, 100 * var_pid / (var_fixed + var_pid + var_resid)))
  cat(sprintf("  Residual (within-person):   %.3f (%.1f%%)\n", var_resid, 100 * var_resid / (var_fixed + var_pid + var_resid)))

  cat("\n")

  results[[measure]] <- tibble(
    measure = measure,
    R2_marginal = r2_vals[1, "R2m"],
    R2_conditional = r2_vals[1, "R2c"],
    R2_null_conditional = r2_null[1, "R2c"],
    delta_R2_marginal = delta_r2m,
    var_fixed = var_fixed,
    var_PID = var_pid,
    var_residual = var_resid,
    pct_fixed = 100 * var_fixed / (var_fixed + var_pid + var_resid),
    pct_PID = 100 * var_pid / (var_fixed + var_pid + var_resid),
    pct_residual = 100 * var_resid / (var_fixed + var_pid + var_resid)
  )
}

combined <- bind_rows(results)
write_csv(combined, file.path(output_dir, "effect_sizes.csv"))
cat("\nSaved effect sizes to:", file.path(output_dir, "effect_sizes.csv"), "\n")
