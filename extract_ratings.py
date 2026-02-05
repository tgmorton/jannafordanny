#!/usr/bin/env python3
"""
Extract ratings from jsPsych experiment JSON and save as within-subjects CSV.

Usage:
    python extract_ratings.py <input_json> [output_csv]

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


def extract_ratings(input_file, output_file=None):
    with open(input_file) as f:
        data = json.load(f)

    # Get PID
    pid = data[0].get('participant_pid', 'unknown')

    # Generate output filename if not provided
    if output_file is None:
        base = os.path.splitext(input_file)[0]
        output_file = f"{base}_ratings.csv"

    rows = []
    trial_num = 0
    current_block_type = ''  # Track block type from most recent practice video
    block_num = 0

    for i, trial in enumerate(data):
        # Check for video trials
        is_video = False
        trial_type = None
        stim = None
        trial_index = trial.get('trial_index')

        if trial.get('trial_type') == 'video-dial-rating':
            is_video = True
            task = trial.get('task', '')
            if task == 'nature_video_dial':
                trial_type = 'nature'
            else:
                trial_type = 'main'
            stim = trial.get('stimulus', ['?'])[0].split('/')[-1]
        elif trial.get('task') == 'practice_video':
            is_video = True
            trial_type = 'practice'
            stim = trial.get('stimulus', ['?'])[0].split('/')[-1]
            # Update block type based on practice video
            current_block_type = PRACTICE_TO_BLOCK_TYPE.get(stim, '')
            block_num += 1

        if is_video:
            trial_num += 1
            # Collect the 4 ratings
            ratings = {'arousal': '', 'pleasure': '', 'distraction': '', 'immersion': ''}
            for j in range(i + 1, min(i + 10, len(data))):
                next_trial = data[j]
                if next_trial.get('task') == 'rating':
                    rt_type = next_trial.get('rating_type')
                    rt_val = next_trial.get('rating')
                    if rt_type in ratings:
                        ratings[rt_type] = rt_val
                elif next_trial.get('trial_type') == 'video-dial-rating' or next_trial.get('task') == 'practice_video':
                    break

            # Determine block type for this trial
            if trial_type == 'nature':
                block_type = ''
                block = 0
            else:
                block_type = current_block_type
                block = block_num

            rows.append({
                'PID': pid,
                'trial_number': trial_num,
                'trial_index': trial_index,
                'block': block,
                'block_type': block_type,
                'trial_type': trial_type,
                'video': stim,
                'arousal': ratings['arousal'],
                'pleasure': ratings['pleasure'],
                'distraction': ratings['distraction'],
                'immersion': ratings['immersion']
            })

    # Write CSV
    with open(output_file, 'w', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=[
            'PID', 'trial_number', 'trial_index', 'block', 'block_type', 'trial_type', 'video',
            'arousal', 'pleasure', 'distraction', 'immersion'
        ])
        writer.writeheader()
        writer.writerows(rows)

    print(f"Extracted {len(rows)} trials for PID {pid}")
    print(f"CSV saved to: {output_file}")
    return output_file


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    input_file = sys.argv[1]
    output_file = sys.argv[2] if len(sys.argv) > 2 else None

    extract_ratings(input_file, output_file)
