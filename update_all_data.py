#!/usr/bin/env python3
"""
Update all DHS budget data from OpenOMB
This script runs the full pipeline to refresh all data
"""
import subprocess
import sys
import os
from datetime import datetime
import json

def run_command(cmd, description):
    """Run a command and handle errors"""
    print(f"\n{'='*60}")
    print(f"{description}")
    print(f"{'='*60}")
    
    try:
        # Don't capture output for better real-time progress display
        result = subprocess.run(cmd, shell=True)
        
        if result.returncode == 0:
            print("\n✓ Success")
            return True
        else:
            print("\n✗ Failed")
            return False
    except Exception as e:
        print(f"\n✗ Exception: {e}")
        return False

def check_openomb_availability():
    """Check if OpenOMB is accessible"""
    print("\nChecking OpenOMB availability...")
    
    try:
        import requests
        response = requests.get("https://openomb.org", timeout=10)
        if response.status_code == 200:
            print("✓ OpenOMB is accessible")
            return True
        else:
            print(f"✗ OpenOMB returned status {response.status_code}")
            return False
    except Exception as e:
        print(f"✗ OpenOMB is not accessible: {e}")
        return False

def update_data():
    """Run the full update pipeline"""
    
    print("="*60)
    print("DHS BUDGET DATA UPDATE")
    print(f"Started at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("="*60)
    
    # Check if OpenOMB is available
    if not check_openomb_availability():
        print("\n⚠️  WARNING: OpenOMB appears to be down or inaccessible.")
        print("The update cannot proceed. Please try again later.")
        return False
    
    # Create data directory if it doesn't exist
    os.makedirs("data", exist_ok=True)
    
    # Step 1: Get metadata
    success = run_command(
        "python get_dhs_metadata.py",
        "Step 1: Fetching DHS file metadata from OpenOMB"
    )
    
    if not success:
        print("\n✗ Failed to fetch metadata. Aborting update.")
        return False
    
    # Step 2: Aggregate budget data
    success = run_command(
        "python aggregate_dhs_budget_by_tas.py --output data/dhs_tas_aggregated.csv",
        "Step 2: Aggregating all DHS budget data (this may take 10-15 minutes)"
    )
    
    if not success:
        print("\n✗ Failed to aggregate budget data. Aborting update.")
        return False
    
    # Step 3: Generate treemap views
    success = run_command(
        "python generate_treemap_views.py",
        "Step 3: Generating treemap visualization views"
    )
    
    if not success:
        print("\n✗ Failed to generate views. Aborting update.")
        return False
    
    # Step 4: Create metadata file with update timestamp
    metadata = {
        "last_updated": datetime.now().isoformat(),
        "update_status": "success",
        "source": "OpenOMB.org",
        "notes": "Full DHS budget apportionment data"
    }
    
    with open("data/update_metadata.json", "w") as f:
        json.dump(metadata, f, indent=2)
    
    print(f"\n{'='*60}")
    print("✓ UPDATE COMPLETE")
    print(f"Finished at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"{'='*60}")
    
    # Show summary
    if os.path.exists("data/dhs_tas_aggregated.csv"):
        import pandas as pd
        df = pd.read_csv("data/dhs_tas_aggregated.csv")
        total_amount = df['amount'].sum()
        print(f"\nSummary:")
        print(f"  Total records: {len(df):,}")
        print(f"  Total amount: ${total_amount:,.0f}")
        print(f"  Fiscal years: {sorted(df['fiscal_year'].unique())}")
    
    return True

def main():
    """Main function"""
    
    # Check Python version
    if sys.version_info < (3, 7):
        print("Error: Python 3.7 or higher is required")
        sys.exit(1)
    
    # Run update
    success = update_data()
    
    if success:
        print("\n✓ All data has been successfully updated!")
        print("You can now view the visualization by running: python serve.py")
    else:
        print("\n✗ Update failed. Please check the errors above.")
        sys.exit(1)

if __name__ == "__main__":
    main()