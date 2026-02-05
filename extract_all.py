#!/usr/bin/env python3
"""
Extract ratings from all participant JSON files in a results directory.

Scans for JSON files recursively, extracts discrete and dial ratings
from each participant, and writes combined CSVs.

Usage:
    python extract_all.py [results_dir] [output_dir]

Defaults: results_dir=results, output_dir=.
"""

import json
import csv
import sys
import os
import glob

# Map practice video filenames to block types
PRACTICE_TO_BLOCK_TYPE = {
    'naturalpractice.mp4': 'neutral',
    'observepractice.mp4': 'observatory',
    'participatepractice.mp4': 'participatory',
}


def extract_ratings_from_data(pid, data):
    """Extract discrete ratings from parsed JSON data. Returns list of row dicts."""
    rows = []
    trial_num = 0
    current_block_type = ''
    block_num = 0

    for i, trial in enumerate(data):
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
            current_block_type = PRACTICE_TO_BLOCK_TYPE.get(stim, '')
            block_num += 1

        if is_video:
            trial_num += 1
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

    return rows


def extract_dial_ratings_from_data(pid, data):
    """Extract continuous dial ratings from parsed JSON data. Returns (rows, max_samples)."""
    rows = []
    trial_num = 0
    current_block_type = ''
    block_num = 0
    max_samples = 0

    for trial in data:
        is_dial_video = trial.get('trial_type') == 'video-dial-rating'

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

    return rows, max_samples


def main():
    results_dir = sys.argv[1] if len(sys.argv) > 1 else 'results'
    output_dir = sys.argv[2] if len(sys.argv) > 2 else '.'

    if not os.path.isdir(results_dir):
        print(f"Error: results directory '{results_dir}' not found")
        sys.exit(1)

    os.makedirs(output_dir, exist_ok=True)

    json_files = sorted(glob.glob(os.path.join(results_dir, '**', '*.json'), recursive=True))
    if not json_files:
        print(f"No JSON files found in {results_dir}")
        sys.exit(1)

    print(f"Found {len(json_files)} JSON files in {results_dir}")

    all_ratings = []
    all_dial_rows = []
    global_max_samples = 0
    seen_pids = set()

    for json_file in json_files:
        print(f"\nProcessing: {json_file}")
        with open(json_file) as f:
            content = f.read()

        # Try standard JSON first; fall back to JATOS multi-line format
        try:
            data = json.loads(content)
        except json.JSONDecodeError:
            # JATOS format: each line is a separate JSON array
            data = []
            for line in content.splitlines():
                line = line.strip()
                if line:
                    data.extend(json.loads(line))
            print(f"  (parsed as JATOS multi-line format, {len(data)} entries)")

        pid = data[0].get('participant_pid', 'unknown')

        if pid in seen_pids:
            print(f"  WARNING: Duplicate PID {pid}, skipping {json_file}")
            continue
        seen_pids.add(pid)

        # Extract discrete ratings
        ratings_rows = extract_ratings_from_data(pid, data)
        all_ratings.extend(ratings_rows)
        print(f"  PID {pid}: {len(ratings_rows)} discrete rating trials")

        # Extract dial ratings
        dial_rows, max_samples = extract_dial_ratings_from_data(pid, data)
        all_dial_rows.extend(dial_rows)
        global_max_samples = max(global_max_samples, max_samples)
        print(f"  PID {pid}: {len(dial_rows)} dial rating trials (max {max_samples} samples)")

    # Write all_ratings.csv
    ratings_file = os.path.join(output_dir, 'all_ratings.csv')
    with open(ratings_file, 'w', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=[
            'PID', 'trial_number', 'trial_index', 'block', 'block_type', 'trial_type', 'video',
            'arousal', 'pleasure', 'distraction', 'immersion'
        ])
        writer.writeheader()
        writer.writerows(all_ratings)
    print(f"\nWrote {len(all_ratings)} rows to {ratings_file}")

    # Write all_dial_ratings.csv
    dial_file = os.path.join(output_dir, 'all_dial_ratings.csv')
    fieldnames = ['PID', 'trial_number', 'trial_index', 'block', 'block_type', 'trial_type', 'video', 'baseline', 'mean']
    fieldnames += [f'ts_{i+1}' for i in range(global_max_samples)]

    with open(dial_file, 'w', newline='') as f:
        writer = csv.writer(f)
        writer.writerow(fieldnames)
        for row in all_dial_rows:
            csv_row = [
                row['PID'], row['trial_number'], row['trial_index'], row['block'],
                row['block_type'], row['trial_type'], row['video'], row['baseline'], row['mean']
            ]
            csv_row += row['values']
            csv_row += [''] * (len(fieldnames) - len(csv_row))
            writer.writerow(csv_row)
    print(f"Wrote {len(all_dial_rows)} rows to {dial_file}")

    print(f"\nParticipants: {sorted(seen_pids)}")
    print(f"Max dial samples: {global_max_samples}")


if __name__ == '__main__':
    main()
