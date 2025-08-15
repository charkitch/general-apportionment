/**
 * Common utilities for DHS budget visualization tools
 */

// Component name mappings and display standards loaded from YAML config
let componentMappings = null;
let displayStandards = null;

/**
 * Load component mappings from config
 */
async function loadComponentMappings() {
    if (componentMappings) return componentMappings;
    
    try {
        // Try to load from dataConfig if available
        if (typeof dataConfig !== 'undefined' && dataConfig.getConfig) {
            const config = await dataConfig.getConfig();
            const dimensions = config.dimensions;
            
            if (dimensions && dimensions.component && dimensions.component.abbreviations) {
                componentMappings = dimensions.component.abbreviations;
                return componentMappings;
            }
        }
        
        // Fallback: try to load YAML directly
        const response = await fetch('config/data_schema.yaml');
        const yamlText = await response.text();
        const config = jsyaml.load(yamlText);
        
        if (config.dimensions && config.dimensions.component && config.dimensions.component.abbreviations) {
            componentMappings = config.dimensions.component.abbreviations;
        } else {
            componentMappings = {};
        }
        
        // Load display standards
        if (config.display_standards) {
            displayStandards = config.display_standards;
        }
        
        return componentMappings;
    } catch (error) {
        console.warn('Could not load component mappings:', error);
        componentMappings = {};
        return {};
    }
}

/**
 * Get standardized component name based on context
 * @param {string} fullName - Full component name
 * @param {string} context - Context where name is used ('filter', 'label', 'table', 'tooltip')
 * @returns {string} Standardized component name
 */
function getComponentName(fullName, context = 'label') {
    if (!fullName) return '';
    
    // Ensure mappings are loaded
    if (!componentMappings || !displayStandards) {
        console.warn('Component mappings not loaded, returning original name');
        return fullName;
    }
    
    // Check if we should use abbreviation based on context
    const useAbbreviation = displayStandards?.use_abbreviations_in?.[context] !== false;
    
    // If we should use abbreviation and it exists, use it
    if (useAbbreviation && componentMappings[fullName]) {
        return componentMappings[fullName];
    }
    
    // Otherwise return the full name
    return fullName;
}

/**
 * Get standardized value display
 * @param {string} dimension - Dimension name (e.g., 'fund_type')
 * @param {string} value - Raw value
 * @returns {string} Standardized display value
 */
function getStandardizedValue(dimension, value) {
    if (!value) return '';
    
    // Check for standardized values in config
    const standardized = displayStandards?.standardized_values?.[dimension]?.[value];
    if (standardized) {
        return standardized;
    }
    
    // Default: return original value
    return value;
}

/**
 * Get full component name from abbreviation
 * @param {string} abbreviation - Component abbreviation
 * @returns {string} Full component name
 */
function getFullComponentName(abbreviation) {
    if (!abbreviation) return '';
    
    // Find the full name by searching through mappings
    for (const [fullName, abbrev] of Object.entries(componentMappings || {})) {
        if (abbrev === abbreviation) {
            return fullName;
        }
    }
    
    // If not found, return the original
    return abbreviation;
}

/**
 * Format currency consistently across all tools
 * @param {number} amount - Amount to format
 * @param {boolean} compact - Use compact notation (default: true)
 * @returns {string} Formatted currency string
 */
function formatCurrency(amount, compact = true) {
    // Handle null, undefined, or non-numeric values
    if (amount === null || amount === undefined || isNaN(amount)) {
        return '$0';
    }
    
    // Convert to number if it's a string
    amount = Number(amount);
    
    if (compact) {
        if (amount >= 1e9) {
            return '$' + (amount / 1e9).toFixed(2) + 'B';
        } else if (amount >= 1e6) {
            return '$' + (amount / 1e6).toFixed(2) + 'M';
        } else if (amount >= 1e3) {
            return '$' + (amount / 1e3).toFixed(0) + 'K';
        }
    }
    
    return '$' + amount.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

/**
 * Format percentage consistently
 * @param {number} value - Value to format as percentage
 * @param {number} decimals - Number of decimal places (default: 1)
 * @returns {string} Formatted percentage string
 */
function formatPercentage(value, decimals = 1) {
    if (value === null || value === undefined || isNaN(value)) {
        return '0%';
    }
    
    return value.toFixed(decimals) + '%';
}

/**
 * Get fiscal year display format
 * @param {number} year - Fiscal year (e.g., 2025)
 * @returns {string} Formatted fiscal year (e.g., "FY 2025")
 */
function formatFiscalYear(year) {
    return `FY ${year}`;
}

/**
 * Parse fiscal year from various formats
 * @param {string|number} fyString - Fiscal year in various formats
 * @returns {number} Fiscal year as number
 */
function parseFiscalYear(fyString) {
    if (typeof fyString === 'number') return fyString;
    
    // Handle "FY 2025", "FY2025", "2025" formats
    const match = fyString.toString().match(/(\d{4})/);
    return match ? parseInt(match[1]) : null;
}

/**
 * Get default fiscal year from config
 * @returns {number} Default fiscal year
 */
async function getDefaultFiscalYear() {
    try {
        if (!componentMappings) {
            await loadComponentMappings();
        }
        
        // Try to get from loaded config
        const yamlText = await (await fetch('config/data_schema.yaml')).text();
        const config = jsyaml.load(yamlText);
        
        return config?.analysis_settings?.comparison_years?.default || 2025;
    } catch (error) {
        console.warn('Could not load default fiscal year:', error);
        return 2025;
    }
}

/**
 * Sort fiscal years according to config
 * @param {Array} years - Array of fiscal years (as numbers or strings)
 * @param {string} order - Sort order ('ascending' or 'descending')
 * @returns {Array} Sorted array of years
 */
function sortFiscalYears(years, order = 'ascending') {
    // Convert all to numbers and sort
    const numericYears = years.map(y => parseFiscalYear(y)).filter(y => y !== null);
    
    if (order === 'ascending') {
        return numericYears.sort((a, b) => a - b);
    } else {
        return numericYears.sort((a, b) => b - a);
    }
}

/**
 * Build fiscal year filter with standardized sorting and default
 * @param {string} selectId - ID of the select element
 * @param {Array} years - Array of available years
 * @param {number} defaultYear - Default year to select (optional)
 */
async function buildFiscalYearFilter(selectId, years, defaultYear = null) {
    const select = document.getElementById(selectId);
    if (!select) return;
    
    // Get default year if not provided
    if (!defaultYear) {
        defaultYear = await getDefaultFiscalYear();
    }
    
    // Sort years (ascending by default)
    const sortedYears = sortFiscalYears(years);
    
    // Clear and populate
    select.innerHTML = '';
    
    // Add "All Years" option if there are multiple years
    if (sortedYears.length > 1) {
        const allOption = document.createElement('option');
        allOption.value = 'all';
        allOption.textContent = 'All Years';
        select.appendChild(allOption);
    }
    
    // Add individual years
    sortedYears.forEach(year => {
        const option = document.createElement('option');
        option.value = year;
        option.textContent = formatFiscalYear(year);
        select.appendChild(option);
    });
    
    // Set default value
    if (select.querySelector(`option[value="${defaultYear}"]`)) {
        select.value = defaultYear;
    } else if (sortedYears.length === 1) {
        select.value = sortedYears[0];
    } else {
        select.value = 'all';
    }
    
    return sortedYears;
}

/**
 * Format number with commas
 * @param {number} value - Number to format
 * @returns {string} Formatted number
 */
function formatNumber(value) {
    if (value === null || value === undefined || isNaN(value)) {
        return '0';
    }
    return Number(value).toLocaleString('en-US');
}

/**
 * Create a standardized table with download functionality
 * @param {Object} config - Table configuration
 * @param {string} config.containerId - ID of the container element
 * @param {Array} config.headers - Array of header objects [{label: 'Name', key: 'name', type: 'text'}]
 * @param {Array} config.data - Array of data objects
 * @param {string} config.title - Title for the table (optional)
 * @param {string} config.filename - Filename for CSV download (optional)
 * @param {boolean} config.showTotal - Whether to show a total row (optional)
 * @param {Function} config.formatValue - Custom value formatter (optional)
 */
function createStandardTable(config) {
    const container = document.getElementById(config.containerId);
    if (!container) {
        console.error(`Container ${config.containerId} not found`);
        return;
    }
    
    console.log('Creating table with config:', config);
    console.log('Headers:', config.headers);
    console.log('Data rows:', config.data ? config.data.length : 0);
    
    // Clear existing content
    container.innerHTML = '';
    
    // Create wrapper div
    const wrapper = document.createElement('div');
    wrapper.className = 'standard-table-wrapper';
    
    // Add title and download button
    if (config.title || config.filename) {
        const header = document.createElement('div');
        header.className = 'table-header';
        header.style.cssText = 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;';
        
        if (config.title) {
            const title = document.createElement('h3');
            title.textContent = config.title;
            title.style.margin = '0';
            header.appendChild(title);
        }
        
        if (config.filename) {
            const downloadBtn = document.createElement('button');
            downloadBtn.textContent = 'Download CSV';
            downloadBtn.className = 'download-btn';
            downloadBtn.style.cssText = 'padding: 6px 12px; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 14px;';
            downloadBtn.onmouseover = () => downloadBtn.style.background = '#0056b3';
            downloadBtn.onmouseout = () => downloadBtn.style.background = '#007bff';
            downloadBtn.onclick = () => downloadTableAsCSV(config.headers, config.data, config.filename);
            header.appendChild(downloadBtn);
        }
        
        wrapper.appendChild(header);
    }
    
    // Create table
    const table = document.createElement('table');
    table.className = 'standard-table';
    table.style.cssText = 'width: 100%; border-collapse: collapse; font-size: 14px;';
    
    // Create header
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    
    config.headers.forEach((header, index) => {
        const th = document.createElement('th');
        // Handle both string headers and object headers
        const isString = typeof header === 'string';
        th.textContent = isString ? header : header.label;
        th.style.cssText = 'background: #f8f9fa; padding: 10px; text-align: left; font-weight: 600; border-bottom: 2px solid #dee2e6;';
        // Check if it's a numeric column (last columns usually are amounts)
        if (!isString && (header.type === 'amount' || header.type === 'number' || header.type === 'percent')) {
            th.style.textAlign = 'right';
        } else if (isString && (header.includes('FY') || header === 'Total' || header.includes('Amount'))) {
            th.style.textAlign = 'right';
        }
        headerRow.appendChild(th);
    });
    
    thead.appendChild(headerRow);
    table.appendChild(thead);
    
    // Create body
    const tbody = document.createElement('tbody');
    
    config.data.forEach((row, idx) => {
        const tr = document.createElement('tr');
        
        // Check if this is the last row (totals row)
        const isLastRow = idx === config.data.length - 1 && config.showTotal;
        
        if (isLastRow) {
            tr.className = 'total-row';
            tr.style.cssText = 'font-weight: 600; background: #f8f9fa; border-top: 2px solid #dee2e6;';
        } else {
            if (idx % 2 === 1) {
                tr.style.background = '#f8f9fa';
            }
            tr.onmouseover = () => tr.style.background = '#e9ecef';
            tr.onmouseout = () => tr.style.background = idx % 2 === 1 ? '#f8f9fa' : 'white';
        }
        
        config.headers.forEach((header, colIndex) => {
            const td = document.createElement('td');
            td.style.cssText = 'padding: 8px 10px; border-bottom: 1px solid #eee;';
            
            let value;
            // Handle both array data and object data
            if (Array.isArray(row)) {
                value = row[colIndex];
            } else if (typeof header === 'string') {
                value = row[colIndex]; // Fallback for string headers with array data
            } else {
                value = row[header.key];
            }
            
            // Apply custom formatting if provided
            if (typeof header === 'object' && header.formatter && typeof header.formatter === 'function') {
                value = header.formatter(value, row);
            } else {
                // Default formatting based on type or header name
                const isString = typeof header === 'string';
                const headerText = isString ? header : (header.label || '');
                
                if (!isString && header.type === 'amount') {
                    td.style.textAlign = 'right';
                    td.style.fontFamily = 'monospace';
                    value = formatCurrency(value);
                } else if (!isString && header.type === 'number') {
                    td.style.textAlign = 'right';
                    td.style.fontFamily = 'monospace';
                    value = formatNumber(value);
                } else if (!isString && header.type === 'percent') {
                    td.style.textAlign = 'right';
                    value = typeof value === 'number' ? formatPercentage(value) : value;
                } else if (isString && (headerText.includes('FY') || headerText === 'Total' || headerText.includes('Amount'))) {
                    // For string headers, check if it looks like a numeric column
                    td.style.textAlign = 'right';
                    td.className = 'amount';
                    // Value is already formatted by the calling function
                }
            }
            
            td.textContent = value || '';
            tr.appendChild(td);
        });
        
        tbody.appendChild(tr);
    });
    
    // Don't add automatic total row - it's included in the data
    // The calling code handles totals to ensure proper formatting
    
    table.appendChild(tbody);
    wrapper.appendChild(table);
    container.appendChild(wrapper);
    
    // Show container if it was hidden
    container.style.display = 'block';
}

/**
 * Download table data as CSV
 */
function downloadTableAsCSV(headers, data, filename) {
    // Create CSV content
    let csv = headers.map(h => `"${h.label}"`).join(',') + '\n';
    
    data.forEach(row => {
        const values = headers.map(header => {
            let value = row[header.key];
            
            // Handle different value types
            if (value === null || value === undefined) {
                return '';
            } else if (typeof value === 'number') {
                return value;
            } else {
                // Escape quotes and wrap in quotes
                return `"${String(value).replace(/"/g, '""')}"`;
            }
        });
        
        csv += values.join(',') + '\n';
    });
    
    // Create blob and download
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    
    if (navigator.msSaveBlob) { // IE 10+
        navigator.msSaveBlob(blob, filename);
    } else {
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        loadComponentMappings,
        getComponentName,
        getFullComponentName,
        getStandardizedValue,
        formatCurrency,
        formatPercentage,
        formatNumber,
        formatFiscalYear,
        parseFiscalYear,
        sortFiscalYears,
        buildFiscalYearFilter,
        getDefaultFiscalYear,
        createStandardTable,
        downloadTableAsCSV
    };
}