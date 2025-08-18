/**
 * Get apportionment data information dynamically
 */

async function getApportionmentInfo() {
    try {
        // Load the metadata which should contain the most recent approval date
        const response = await fetch('processed_data/appropriations/update_metadata.json');
        const metadata = await response.json();
        
        if (metadata.max_approval_date) {
            const date = new Date(metadata.max_approval_date);
            const options = { year: 'numeric', month: 'long', day: 'numeric' };
            return `Most recent approval ${date.toLocaleDateString('en-US', options)}`;
        }
        
        // Fallback
        return 'Data current as of last update';
        
    } catch (error) {
        console.warn('Could not load apportionment metadata:', error);
        return 'Data current as of last update';
    }
}

// Export if using modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { getApportionmentInfo };
}