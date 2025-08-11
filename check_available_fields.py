#!/usr/bin/env python3
"""Check what fields are available in OpenOMB API responses"""
import requests
import json
from pprint import pprint

def check_available_fields():
    # Fetch a sample DHS file
    file_id = 11192642  # A known DHS file from our data
    url = f"https://openomb.org/api/v1/files/{file_id}"
    
    print(f"Fetching file {file_id}...")
    response = requests.get(url, params={"sourceData": "true"})
    
    if response.status_code != 200:
        print(f"Error: Status {response.status_code}")
        return
    
    data = response.json()
    results = data.get('results', {})
    
    # Check file metadata
    print("\n=== FILE METADATA FIELDS ===")
    file_meta = results.get('file', {})
    for key in sorted(file_meta.keys()):
        print(f"  {key}: {file_meta[key]}")
    
    # Check sourceData structure
    print("\n=== SOURCE DATA STRUCTURE ===")
    source_data = results.get('sourceData', {})
    if isinstance(source_data, dict):
        print(f"Keys in sourceData: {list(source_data.keys())}")
        
        # Check if it has schedules
        if 'schedule' in source_data:
            schedules = source_data['schedule']
            print(f"\nNumber of schedules: {len(schedules) if isinstance(schedules, list) else 'Not a list'}")
            
            if isinstance(schedules, list) and schedules:
                first_schedule = schedules[0]
                print(f"Keys in first schedule: {list(first_schedule.keys()) if isinstance(first_schedule, dict) else 'Not a dict'}")
                
                if isinstance(first_schedule, dict) and 'lines' in first_schedule:
                    lines = first_schedule['lines']
                    if isinstance(lines, list) and lines:
                        first_line = lines[0]
                        print("\n=== SCHEDULE LINE FIELDS ===")
                        for key in sorted(first_line.keys()):
                            value = first_line[key]
                            print(f"  {key}: {value} ({type(value).__name__})")
                        return first_line
    
    # Look for specific fields related to budget categories
    if schedules and schedules[0].get('lines'):
        print("\n=== POTENTIAL BUDGET CATEGORY FIELDS ===")
        budget_fields = ['BudgetEnforcementCategory', 'BudgetCategory', 'BudgetFunction', 
                         'BudgetSubfunction', 'SourceType', 'EmergencyIndicator', 
                         'DisasterIndicator', 'CovidIndicator', 'OffsetIndicator']
        
        for field in budget_fields:
            if field in first_line:
                print(f"  ✓ {field}: {first_line[field]}")
            else:
                print(f"  ✗ {field}: NOT FOUND")
    
    # Also check the raw data structure
    print("\n=== RAW DATA STRUCTURE ===")
    print(f"Keys in results: {list(results.keys())}")
    if 'data' in results:
        print(f"Keys in data: {list(results['data'].keys())}")

if __name__ == "__main__":
    check_available_fields()