/**
 * Data Availability Utilities
 * Dynamically determine data availability from file names and metadata
 */

// Map of fiscal periods to months
const PERIOD_TO_MONTH = {
    'P01': 'October',
    'P02': 'November', 
    'P03': 'December',
    'P04': 'January',
    'P05': 'February',
    'P06': 'March',
    'P07': 'April',
    'P08': 'May',
    'P09': 'June',
    'P10': 'July',
    'P11': 'August',
    'P12': 'September'
};

// Map of periods to quarters
const PERIOD_TO_QUARTER = {
    'P01': 'Q1', 'P02': 'Q1', 'P03': 'Q1',
    'P04': 'Q2', 'P05': 'Q2', 'P06': 'Q2',
    'P07': 'Q3', 'P08': 'Q3', 'P09': 'Q3',
    'P10': 'Q4', 'P11': 'Q4', 'P12': 'Q4'
};

/**
 * Get USAspending data availability from raw data directory structure
 * This function would need to be called from server-side or have the info passed from processing
 */
async function getUSAspendingDataAvailability() {
    // Since we can't access file system from browser, we'll use the known pattern
    // from our file names: FY2025P01-P09, FY2022P01-P12, etc.
    
    // This info should ideally come from a metadata file generated during processing
    const knownAvailability = {
        2022: { startPeriod: 'P01', endPeriod: 'P12' },
        2023: { startPeriod: 'P01', endPeriod: 'P12' },
        2024: { startPeriod: 'P01', endPeriod: 'P12' },
        2025: { startPeriod: 'P01', endPeriod: 'P09' }
    };
    
    const availability = {};
    
    for (const [year, periods] of Object.entries(knownAvailability)) {
        const endMonth = PERIOD_TO_MONTH[periods.endPeriod];
        const endQuarter = PERIOD_TO_QUARTER[periods.endPeriod];
        
        if (periods.endPeriod === 'P12') {
            availability[year] = 'Complete';
        } else {
            availability[year] = `Through ${endMonth} (${endQuarter})`;
        }
    }
    
    return availability;
}

/**
 * Format data availability for display
 */
function formatDataAvailability(availability) {
    const parts = [];
    const years = Object.keys(availability).sort();
    
    for (const year of years) {
        parts.push(`FY${year} (${availability[year]})`);
    }
    
    return parts.join(' • ');
}

/**
 * Get a human-readable summary of USAspending data currency
 */
function getUSAspendingDataSummary(availability) {
    const years = Object.keys(availability).sort();
    const currentYear = Math.max(...years);
    const completeYears = years.filter(y => availability[y] === 'Complete' && y != currentYear);
    
    let summary = '';
    
    // Handle current year
    if (availability[currentYear] && availability[currentYear] !== 'Complete') {
        summary = `FY${currentYear} ${availability[currentYear].toLowerCase()}`;
    } else if (availability[currentYear] === 'Complete') {
        summary = `FY${currentYear} complete`;
    }
    
    // Handle complete years
    if (completeYears.length > 0) {
        const yearRange = completeYears.length > 1 
            ? `FY${Math.min(...completeYears)}-${Math.max(...completeYears)}` 
            : `FY${completeYears[0]}`;
        summary += summary ? `, ${yearRange} complete` : `${yearRange} complete`;
    }
    
    return summary;
}

// Export functions if using modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        getUSAspendingDataAvailability,
        formatDataAvailability,
        getUSAspendingDataSummary,
        PERIOD_TO_MONTH,
        PERIOD_TO_QUARTER
    };
}