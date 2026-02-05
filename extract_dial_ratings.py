#!/usr/bin/env python3
"""
Extract continuous dial ratings from jsPsych experiment JSON and save as CSV.

Each row is one video trial with columns:
- PID, trial_number, trial_index, block, block_type, trial_type, video
- baseline (dial value at video start)
- mean (mean dial value across video)
- ts_1, ts_2, ... ts_n (dial values at each sample timestamp)

Usage:
    python extract_dial_ratings.py <input_json> [output_csv]

If output_csv is not specified, it will be named based on the input file.
"""

import json
import csv
import sys
import os

# Map practice video filenames to block types
PRACTICE_TO_BLOCK_TYPE = {
    'naturalpractice.mp4': 'neutral',
    'observepractice.mp4': 'observatory',
    'participatepractice.mp4': 'participatory',
}


def extract_dial_ratings(input_file, output_file=None):
    with open(input_file) as f:
        data = json.load(f)

    # Generate output filename if not provided
    if output_file is None:
        base = os.path.splitext(input_file)[0]
        output_file = f"{base}_dial_ratings.csv"

    pid = data[0].get('participant_pid', 'unknown')

    rows = []
    trial_num = 0
    current_block_type = ''
    block_num = 0
    max_samples = 0

    for trial in data:
        is_dial_video = trial.get('trial_type') == 'video-dial-rating'

        # Track block type from practice videos
        if trial.get('task') == 'practice_video':
            stim = trial.get('stimulus', ['?'])[0].split('/')[-1]
            current_block_type = PRACTICE_TO_BLOCK_TYPE.get(stim, '')
            block_num += 1

        if is_dial_video:
            trial_num += 1
            task = trial.get('task', '')
            stim = trial.get('stimulus', ['?'])[0].split('/')[-1]

            if task == 'nature_video_dial':
                trial_type = 'nature'
                block_type = ''
                block = 0
            else:
                trial_type = 'main'
                block_type = current_block_type
                block = block_num

            baseline = trial.get('baseline_rating', '')
            mean = trial.get('mean_rating', '')
            ratings = trial.get('ratings', [])

            # Extract just the values from ratings
            values = [r.get('value', '') for r in ratings]
            max_samples = max(max_samples, len(values))

            rows.append({
                'PID': pid,
                'trial_number': trial_num,
                'trial_index': trial.get('trial_index'),
                'block': block,
                'block_type': block_type,
                'trial_type': trial_type,
                'video': stim,
                'baseline': baseline,
                'mean': mean,
                'values': values
            })

    # Create header with timestamp columns
    fieldnames = ['PID', 'trial_number', 'trial_index', 'block', 'block_type', 'trial_type', 'video', 'baseline', 'mean']
    fieldnames += [f'ts_{i+1}' for i in range(max_samples)]

    # Write CSV
    with open(output_file, 'w', newline='') as f:
        writer = csv.writer(f)
        writer.writerow(fieldnames)

        for row in rows:
            csv_row = [
                row['PID'], row['trial_number'], row['trial_index'], row['block'],
                row['block_type'], row['trial_type'], row['video'], row['baseline'], row['mean']
            ]
            csv_row += row['values']
            # Pad with empty strings if fewer samples
            csv_row += [''] * (len(fieldnames) - len(csv_row))
            writer.writerow(csv_row)

    print(f"Extracted {len(rows)} video trials for PID {pid}")
    print(f"Max samples per video: {max_samples}")
    print(f"CSV saved to: {output_file}")
    return output_file


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    input_file = sys.argv[1]
    output_file = sys.argv[2] if len(sys.argv) > 2 else None

    extract_dial_ratings(input_file, output_file)
