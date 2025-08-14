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
import argparse

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

def validate_file_exists(filepath, description):
    """Validate that a required file exists"""
    if not os.path.exists(filepath):
        print(f"\n❌ ERROR: Required file missing: {filepath}")
        print(f"   This file is needed for: {description}")
        return False
    return True

def validate_csv_not_empty(filepath, min_rows=10):
    """Validate that a CSV file exists and has data"""
    try:
        import pandas as pd
        df = pd.read_csv(filepath)
        if len(df) < min_rows:
            print(f"\n❌ ERROR: {filepath} has only {len(df)} rows (expected at least {min_rows})")
            return False
        return True
    except Exception as e:
        print(f"\n❌ ERROR: Cannot read {filepath}: {e}")
        return False

def update_data(skip_fast_book=False, skip_usaspending=False):
    """Run the full update pipeline"""
    
    print("="*60)
    print("DHS BUDGET DATA UPDATE")
    print(f"Started at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("="*60)
    
    if skip_fast_book:
        print("⚠️  Skipping FAST Book download (--skip-fast-book)")
    if skip_usaspending:
        print("⚠️  Skipping USAspending processing (--skip-usaspending)")
    
    # Check if OpenOMB is available
    if not check_openomb_availability():
        print("\n⚠️  WARNING: OpenOMB appears to be down or inaccessible.")
        print("The update cannot proceed. Please try again later.")
        return False
    
    # Create directories if they don't exist
    os.makedirs("processed_data/appropriations", exist_ok=True)
    os.makedirs("processed_data/usaspending", exist_ok=True)
    os.makedirs("processed_data/combined", exist_ok=True)
    os.makedirs("processed_data/treemap_views", exist_ok=True)
    os.makedirs("raw_data/fast_book", exist_ok=True)
    
    # Get the project root directory (where this script is run from)
    # Assuming we're in scripts/utilities/, go up two levels
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(os.path.dirname(script_dir))
    
    # Change to project root directory
    original_dir = os.getcwd()
    os.chdir(project_root)
    
    # Step 1: Download FAST Book data (if not skipped)
    if not skip_fast_book:
        success = run_command(
            "python scripts/utilities/download_fast_book.py",
            "Step 1: Downloading Treasury FAST Book data"
        )
        if not success:
            print("\n⚠️  Failed to download FAST Book. Continuing with existing data...")
    else:
        print("\n⏭️  Skipping Step 1: FAST Book download")
    
    # Validate FAST Book data exists
    if not validate_file_exists("raw_data/fast_book/dhs_tas_fund_type_mapping.csv", 
                               "merging fund types with budget data"):
        print("\n❌ Cannot proceed without FAST Book data")
        os.chdir(original_dir)
        return False
    
    # Step 2: Get metadata from OpenOMB
    success = run_command(
        "python scripts/utilities/get_dhs_metadata.py",
        "Step 2: Fetching DHS file metadata from OpenOMB"
    )
    
    if not success:
        print("\n✗ Failed to fetch metadata. Aborting update.")
        os.chdir(original_dir)
        return False
    
    # Validate metadata was created
    if not validate_csv_not_empty("processed_data/appropriations/dhs_files_with_fy.csv", min_rows=100):
        print("\n❌ Metadata fetch failed - file list is empty or too small")
        os.chdir(original_dir)
        return False
    
    # Step 3: Aggregate budget data
    success = run_command(
        "python scripts/processing/aggregate_dhs_budget_by_tas.py",
        "Step 3: Aggregating all DHS budget data (this may take 10-15 minutes)"
    )
    
    if not success:
        print("\n✗ Failed to aggregate budget data. Aborting update.")
        os.chdir(original_dir)
        return False
    
    # Validate aggregated data
    if not validate_csv_not_empty("processed_data/appropriations/dhs_tas_aggregated.csv", min_rows=500):
        print("\n❌ Budget aggregation failed - output file is empty or too small")
        os.chdir(original_dir)
        return False
    
    # Step 4: Merge fund types from FAST Book
    success = run_command(
        "python scripts/processing/merge_fund_types.py",
        "Step 4: Merging fund type information from Treasury FAST Book"
    )
    
    if not success:
        print("\n✗ Failed to merge fund types. Aborting update.")
        os.chdir(original_dir)
        return False
    
    # Validate merged data
    if not validate_csv_not_empty("processed_data/appropriations/dhs_tas_aggregated_with_fund_types.csv", min_rows=500):
        print("\n❌ Fund type merge failed - output file is empty or too small")
        os.chdir(original_dir)
        return False
    
    if not validate_file_exists("processed_data/appropriations/dhs_budget_flat.json", 
                               "treemap visualization"):
        print("\n❌ Fund type merge failed - JSON output missing")
        os.chdir(original_dir)
        return False
    
    # Step 5: Generate treemap views
    success = run_command(
        "python scripts/processing/generate_treemap_views.py",
        "Step 5: Generating treemap visualization views"
    )
    
    if not success:
        print("\n⚠️  Failed to generate views. Continuing...")
    
    # Step 6: Process USAspending data (if not skipped)
    if not skip_usaspending:
        success = run_command(
            "python scripts/processing/process_usaspending_with_object_class.py",
            "Step 6: Processing USAspending data with object class breakdown"
        )
        if not success:
            print("\n⚠️  Failed to process USAspending data. Continuing...")
        
        # Step 6b: Aggregate USAspending data by appropriation year
        success = run_command(
            "python scripts/processing/aggregate_usaspending_by_appropriation_year.py",
            "Step 6b: Aggregating USAspending data by appropriation year"
        )
        if not success:
            print("\n⚠️  Failed to aggregate USAspending data. Continuing...")
        
        # Step 6c: Create combined spending lifecycle data
        success = run_command(
            "python scripts/processing/create_spending_lifecycle_data.py",
            "Step 6c: Creating combined spending lifecycle data"
        )
        if not success:
            print("\n⚠️  Failed to create spending lifecycle data. Continuing...")
        
        # Step 6d: Generate flat spending data for flexible aggregation
        success = run_command(
            "python scripts/processing/generate_spending_flat_data.py",
            "Step 6d: Generating flat spending data for flexible aggregation"
        )
        if not success:
            print("\n⚠️  Failed to generate flat spending data. Continuing...")
        
        # Step 6e: Generate awards data for contracts and grants
        success = run_command(
            "python scripts/processing/generate_awards_flat_data.py",
            "Step 6e: Generating awards data for contracts and grants"
        )
        if not success:
            print("\n⚠️  Failed to generate awards data. Continuing...")
    else:
        print("\n⏭️  Skipping Step 6: USAspending processing")
    
    # Step 7: Create metadata file with update timestamp
    metadata = {
        "last_updated": datetime.now().isoformat(),
        "update_status": "success",
        "source": "OpenOMB.org",
        "notes": "Full DHS budget apportionment data",
        "fast_book_skipped": skip_fast_book,
        "usaspending_skipped": skip_usaspending
    }
    
    with open("processed_data/appropriations/update_metadata.json", "w") as f:
        json.dump(metadata, f, indent=2)
    
    print(f"\n{'='*60}")
    print("✓ UPDATE COMPLETE")
    print(f"Finished at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"{'='*60}")
    
    # Show summary
    if os.path.exists("processed_data/appropriations/dhs_tas_aggregated.csv"):
        import pandas as pd
        df = pd.read_csv("processed_data/appropriations/dhs_tas_aggregated.csv")
        total_amount = df['amount'].sum()
        print(f"\nSummary:")
        print(f"  Total records: {len(df):,}")
        print(f"  Total amount: ${total_amount:,.0f}")
        print(f"  Fiscal years: {sorted(df['fiscal_year'].unique())}")
    
    # Final validation - check all critical files exist
    print("\n=== FINAL VALIDATION ===")
    critical_files = [
        ("processed_data/appropriations/dhs_tas_aggregated_with_fund_types.csv", "Main budget data"),
        ("processed_data/appropriations/dhs_budget_flat.json", "Treemap visualization data"),
        ("processed_data/appropriations/update_metadata.json", "Update metadata"),
    ]
    
    # Add USAspending files if not skipped
    if not skip_usaspending:
        critical_files.extend([
            ("processed_data/usaspending/usaspending_aggregated_by_appropriation_year.json", "Aggregated USAspending data"),
            ("processed_data/usaspending/usaspending_with_object_class.json", "USAspending data with object class breakdown"),
            ("processed_data/usaspending/object_class_summary.csv", "Object class spending summary"),
            ("processed_data/spending_lifecycle/spending_lifecycle_data.json", "Combined spending lifecycle data"),
            ("processed_data/usaspending/spending_flat.json", "Flat spending data for flexible aggregation"),
            ("processed_data/usaspending/awards_flat.json", "Flat awards data for contracts and grants"),
        ])
    
    all_valid = True
    for filepath, description in critical_files:
        if os.path.exists(filepath):
            print(f"✓ {description}: {filepath}")
        else:
            print(f"✗ MISSING {description}: {filepath}")
            all_valid = False
    
    if not all_valid:
        print("\n❌ Some critical files are missing!")
        os.chdir(original_dir)
        return False
    
    # Return to original directory
    os.chdir(original_dir)
    return True

def main():
    """Main function"""
    parser = argparse.ArgumentParser(
        description='Update all DHS budget data from OpenOMB and process USAspending data'
    )
    parser.add_argument(
        '--skip-fast-book', 
        action='store_true',
        help='Skip downloading FAST Book data (use existing)'
    )
    parser.add_argument(
        '--skip-usaspending', 
        action='store_true',
        help='Skip processing USAspending data'
    )
    
    args = parser.parse_args()
    
    try:
        success = update_data(
            skip_fast_book=args.skip_fast_book,
            skip_usaspending=args.skip_usaspending
        )
        
        if success:
            print("\n✅ All updates completed successfully!")
            print("You can now view the visualization by running: python serve.py")
            sys.exit(0)
        else:
            print("\n❌ Update process encountered errors.")
            sys.exit(1)
            
    except KeyboardInterrupt:
        print("\n\n⚠️  Update interrupted by user")
        sys.exit(1)
    except Exception as e:
        print(f"\n❌ Unexpected error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()