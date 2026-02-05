#!/usr/bin/env Rscript
#
# Mixed effects modeling of discrete ratings
# Nested model comparison via log-likelihood / AIC / BIC
#
# Usage: Rscript mixed_models.R [ratings_csv] [output_dir]

library(tidyverse)
library(lme4)
library(lmerTest)  # p-values for fixed effects

args <- commandArgs(trailingOnly = TRUE)
ratings_file <- if (length(args) >= 1) args[1] else "all_ratings.csv"
output_dir <- if (length(args) >= 2) args[2] else "all_plots"

if (!dir.exists(output_dir)) dir.create(output_dir, recursive = TRUE)

# Use bobyqa optimizer with more iterations for better convergence
ctrl <- lmerControl(optimizer = "bobyqa", optCtrl = list(maxfun = 1e5))

# Read and prepare data
ratings <- read_csv(ratings_file, show_col_types = FALSE) %>%
  mutate(
    condition = ifelse(block_type == "", "nature", block_type),
    PID = as.factor(PID),
    video = as.factor(video)
  ) %>%
  filter(condition != "nature", trial_type != "practice")

# Treatment-code condition with neutral as reference
ratings$condition <- factor(ratings$condition, levels = c("neutral", "observatory", "participatory"))

cat("Data: ", nrow(ratings), " observations, ",
    length(unique(ratings$PID)), " participants, ",
    length(unique(ratings$video)), " videos\n\n")

measures <- c("arousal", "pleasure", "distraction", "immersion")

all_comparisons <- list()

for (measure in measures) {
  cat("==============================================================\n")
  cat("MEASURE:", toupper(measure), "\n")
  cat("==============================================================\n\n")

  ratings$y <- as.numeric(ratings[[measure]])

  # --- M0: No random effects (simple linear model) ---
  m0 <- lm(y ~ condition, data = ratings)

  # --- M1: Random intercepts only (PID + video) ---
  m1 <- tryCatch(
    lmer(y ~ condition + (1 | PID) + (1 | video), data = ratings, REML = FALSE, control = ctrl),
    error = function(e) { cat("  M1 failed:", e$message, "\n"); NULL }
  )

  # --- M2: Random intercepts + PID slopes (no video RE) ---
  m2 <- tryCatch(
    lmer(y ~ condition + (1 + condition | PID), data = ratings, REML = FALSE, control = ctrl),
    error = function(e) { cat("  M2 failed:", e$message, "\n"); NULL }
  )

  # --- M3: Random intercepts + video slopes (no PID RE) ---
  m3 <- tryCatch(
    lmer(y ~ condition + (1 + condition | video), data = ratings, REML = FALSE, control = ctrl),
    error = function(e) { cat("  M3 failed:", e$message, "\n"); NULL }
  )

  # --- M4: Full model - intercepts + slopes for both ---
  m4 <- tryCatch(
    lmer(y ~ condition + (1 + condition | PID) + (1 + condition | video), data = ratings, REML = FALSE, control = ctrl),
    error = function(e) { cat("  M4 failed:", e$message, "\n"); NULL }
  )

  # --- M1a: PID intercept only (no video) ---
  m1a <- tryCatch(
    lmer(y ~ condition + (1 | PID), data = ratings, REML = FALSE, control = ctrl),
    error = function(e) { cat("  M1a failed:", e$message, "\n"); NULL }
  )

  # --- M1b: Video intercept only (no PID) ---
  m1b <- tryCatch(
    lmer(y ~ condition + (1 | video), data = ratings, REML = FALSE, control = ctrl),
    error = function(e) { cat("  M1b failed:", e$message, "\n"); NULL }
  )

  # Collect all models that converged
  model_list <- list(
    "M0: condition only (lm)" = m0,
    "M1a: (1|PID)" = m1a,
    "M1b: (1|video)" = m1b,
    "M1: (1|PID)+(1|video)" = m1,
    "M2: (1+cond|PID)" = m2,
    "M3: (1+cond|video)" = m3,
    "M4: (1+cond|PID)+(1+cond|video)" = m4
  )

  # Filter out NULLs
  model_list <- model_list[!sapply(model_list, is.null)]

  # Build comparison table
  comparison <- tibble(
    model = names(model_list),
    df = sapply(model_list, function(m) {
      if (inherits(m, "lm") && !inherits(m, "lmerMod")) length(coef(m)) + 1  # +1 for sigma
      else attr(logLik(m), "df")
    }),
    logLik = sapply(model_list, function(m) as.numeric(logLik(m))),
    AIC = sapply(model_list, function(m) AIC(m)),
    BIC = sapply(model_list, function(m) BIC(m))
  ) %>%
    mutate(delta_AIC = AIC - min(AIC))

  cat("\nModel comparison:\n")
  print(as.data.frame(comparison), row.names = FALSE, right = FALSE)

  # Check for convergence warnings
  cat("\nConvergence notes:\n")
  for (nm in names(model_list)) {
    m <- model_list[[nm]]
    if (inherits(m, "lmerMod")) {
      warns <- m@optinfo$conv$lme4
      if (length(warns) > 0) {
        cat("  ", nm, ": ", warns$messages, "\n")
      } else if (isSingular(m)) {
        cat("  ", nm, ": singular fit (variance component(s) near zero)\n")
      } else {
        cat("  ", nm, ": OK\n")
      }
    }
  }

  # Print summary of best model by AIC
  best_name <- comparison$model[which.min(comparison$AIC)]
  best_model <- model_list[[best_name]]
  cat("\n--- Best model by AIC:", best_name, "---\n")
  if (inherits(best_model, "lmerMod")) {
    print(summary(best_model))
  } else {
    print(summary(best_model))
  }

  # Manual likelihood ratio test function (works for lm vs lmer)
  lrt <- function(m_small, m_big, name_small, name_big) {
    ll_s <- as.numeric(logLik(m_small))
    ll_b <- as.numeric(logLik(m_big))
    if (inherits(m_small, "lm") && !inherits(m_small, "lmerMod")) {
      df_s <- length(coef(m_small)) + 1
    } else {
      df_s <- attr(logLik(m_small), "df")
    }
    if (inherits(m_big, "lm") && !inherits(m_big, "lmerMod")) {
      df_b <- length(coef(m_big)) + 1
    } else {
      df_b <- attr(logLik(m_big), "df")
    }
    chi_sq <- 2 * (ll_b - ll_s)
    delta_df <- df_b - df_s
    p_val <- pchisq(chi_sq, df = delta_df, lower.tail = FALSE)
    cat(sprintf("  %s vs %s: Chi2(%.0f) = %.3f, p = %.4f\n", name_small, name_big, delta_df, chi_sq, p_val))
  }

  # Likelihood ratio tests for nested pairs
  cat("\n--- Likelihood ratio tests ---\n")

  # M0 vs M1a (does PID intercept help?)
  if (!is.null(m1a)) lrt(m0, m1a, "M0", "M1a (add PID intercept)")

  # M0 vs M1b (does video intercept help?)
  if (!is.null(m1b)) lrt(m0, m1b, "M0", "M1b (add video intercept)")

  # M1a vs M1 (add video intercept to PID-only)
  if (!is.null(m1a) && !is.null(m1)) lrt(m1a, m1, "M1a", "M1 (add video intercept)")

  # M1b vs M1 (add PID intercept to video-only)
  if (!is.null(m1b) && !is.null(m1)) lrt(m1b, m1, "M1b", "M1 (add PID intercept)")

  # M1 vs M4 (add slopes to both)
  if (!is.null(m1) && !is.null(m4)) lrt(m1, m4, "M1", "M4 (add slopes to both)")

  cat("\n\n")

  all_comparisons[[measure]] <- comparison
}

# Write combined comparison table
combined <- bind_rows(all_comparisons, .id = "measure")
write_csv(combined, file.path(output_dir, "model_comparison.csv"))
cat("Saved model comparison table to:", file.path(output_dir, "model_comparison.csv"), "\n")
