#!/usr/bin/env python3
import requests
import json

# Fetch a sample file
file_id = 11192642
url = f"https://openomb.org/api/v1/files/{file_id}"
response = requests.get(url, params={"sourceData": "true"})

if response.status_code == 200:
    data = response.json()
    
    # Save to file for inspection
    with open('sample_openomb_response.json', 'w') as f:
        json.dump(data, f, indent=2)
    
    print("Response saved to sample_openomb_response.json")
    
    # Try to find schedule data
    results = data.get('results', {})
    source_data = results.get('sourceData', {})
    
    if isinstance(source_data, dict) and 'schedule' in source_data:
        schedules = source_data['schedule']
        if isinstance(schedules, list) and schedules:
            first_schedule = schedules[0]
            if 'lines' in first_schedule and first_schedule['lines']:
                first_line = first_schedule['lines'][0]
                print("\nAvailable fields in first line:")
                for key in sorted(first_line.keys()):
                    print(f"  {key}")
else:
    print(f"Error: {response.status_code}")