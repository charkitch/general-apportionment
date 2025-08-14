#!/usr/bin/env python3
"""
Regenerate just the flat data files for visualizations.
Assumes all prerequisite data already exists.
"""

import subprocess
import sys
import os
from datetime import datetime

def run_command(cmd, description):
    """Run a command and handle errors"""
    print(f"\n{'='*60}")
    print(f"{description}")
    print(f"{'='*60}")
    
    try:
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

def regenerate_flat_files():
    """Regenerate just the flat data files"""
    
    print("="*60)
    print("REGENERATING FLAT DATA FILES")
    print(f"Started at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("="*60)
    
    # Change to project root directory
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(os.path.dirname(script_dir))
    os.chdir(project_root)
    
    # Step 1: Process USAspending data with object class (creates object_class_summary.csv)
    success = run_command(
        "python scripts/processing/process_usaspending_with_object_class.py",
        "Step 1: Processing USAspending data with object class breakdown"
    )
    if not success:
        print("\n✗ Failed to process object class data. This is required for spending flat file.")
        return False
    
    # Step 2: Generate spending flat data
    success = run_command(
        "python scripts/processing/generate_spending_flat_data.py",
        "Step 2: Generating spending flat data (by category)"
    )
    if not success:
        print("\n⚠️  Failed to generate spending flat data.")
    
    # Step 3: Generate awards flat data
    success = run_command(
        "python scripts/processing/generate_awards_flat_data.py",
        "Step 3: Generating awards flat data (contracts and grants)"
    )
    if not success:
        print("\n⚠️  Failed to generate awards flat data.")
    
    # Optional: Also regenerate spending lifecycle data if needed
    print("\nDo you also want to regenerate spending lifecycle data? (y/n): ", end="")
    response = input().strip().lower()
    
    if response == 'y':
        # Need to run aggregate by appropriation year first
        success = run_command(
            "python scripts/processing/aggregate_usaspending_by_appropriation_year.py",
            "Step 4a: Aggregating USAspending data by appropriation year"
        )
        
        if success:
            success = run_command(
                "python scripts/processing/create_spending_lifecycle_data.py",
                "Step 4b: Creating spending lifecycle data"
            )
    
    print(f"\n{'='*60}")
    print("✓ FLAT FILE REGENERATION COMPLETE")
    print(f"Finished at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"{'='*60}")
    
    print("\nRegenerated files:")
    print("  - processed_data/usaspending/spending_flat.json")
    print("  - processed_data/usaspending/awards_flat.json")
    print("  - processed_data/usaspending/object_class_summary.csv")
    if response == 'y':
        print("  - processed_data/spending_lifecycle/spending_lifecycle_data.json")

def main():
    """Main function"""
    try:
        regenerate_flat_files()
        sys.exit(0)
    except KeyboardInterrupt:
        print("\n\n⚠️  Regeneration interrupted by user")
        sys.exit(1)
    except Exception as e:
        print(f"\n❌ Unexpected error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()