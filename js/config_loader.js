/**
 * Configuration loader for data schema
 * Loads and provides access to the YAML configuration that drives the UI
 */

class DataConfig {
    constructor() {
        this.config = null;
        this.loaded = false;
    }
    
    /**
     * Load configuration from YAML file
     */
    async load(configPath = 'config/data_schema.yaml') {
        try {
            const response = await fetch(configPath);
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const yamlText = await response.text();
            
            // Check if js-yaml is loaded
            if (typeof jsyaml === 'undefined') {
                throw new Error('js-yaml library not loaded. Include it before config_loader.js');
            }
            
            this.config = jsyaml.load(yamlText);
            this.loaded = true;
            this._validateConfig();
            
            return this.config;
        } catch (error) {
            console.error('Failed to load configuration:', error);
            console.error('Config path:', configPath);
            throw error;
        }
    }
    
    /**
     * Validate configuration structure
     */
    _validateConfig() {
        const requiredSections = ['dimensions', 'data_sources', 'valid_groupings'];
        for (const section of requiredSections) {
            if (!this.config[section]) {
                throw new Error(`Missing required section: ${section}`);
            }
        }
    }
    
    /**
     * Get configuration for a specific dimension
     */
    getDimension(dimensionName) {
        this._ensureLoaded();
        return this.config.dimensions[dimensionName] || {};
    }
    
    /**
     * Get configuration for a specific data source
     */
    getDataSource(sourceName) {
        this._ensureLoaded();
        return this.config.data_sources[sourceName] || {};
    }
    
    /**
     * Get list of available dimensions for a data source
     */
    getDimensionsForSource(sourceName) {
        const source = this.getDataSource(sourceName);
        return source.dimensions || [];
    }
    
    /**
     * Get list of filterable dimensions for a data source
     */
    getFiltersForSource(sourceName) {
        const source = this.getDataSource(sourceName);
        return source.filters || [];
    }
    
    /**
     * Get value fields configuration for a data source
     */
    getValueFieldsForSource(sourceName) {
        const source = this.getDataSource(sourceName);
        return source.value_fields || {};
    }
    
    /**
     * Check if a combination of dimensions is valid for grouping
     */
    isValidGrouping(dimensions, sourceName = null) {
        this._ensureLoaded();
        
        // First check if dimensions are available for the source
        if (sourceName) {
            const availableDims = new Set(this.getDimensionsForSource(sourceName));
            if (!dimensions.every(dim => availableDims.has(dim))) {
                return false;
            }
        }
        
        // Check against valid groupings
        const dimSet = new Set(dimensions);
        return this.config.valid_groupings.some(grouping => {
            const groupingSet = new Set(grouping.dimensions);
            return dimSet.size === groupingSet.size && 
                   [...dimSet].every(dim => groupingSet.has(dim));
        });
    }
    
    /**
     * Get recommended maximum items for a grouping
     */
    getMaxItemsForGrouping(dimensions) {
        this._ensureLoaded();
        
        const dimSet = new Set(dimensions);
        const grouping = this.config.valid_groupings.find(g => {
            const groupingSet = new Set(g.dimensions);
            return dimSet.size === groupingSet.size && 
                   [...dimSet].every(dim => groupingSet.has(dim));
        });
        
        return grouping ? grouping.max_items : 1000;
    }
    
    /**
     * Get abbreviation for a dimension value if available
     */
    getAbbreviation(dimension, value) {
        const dimConfig = this.getDimension(dimension);
        const abbreviations = dimConfig.abbreviations || {};
        return abbreviations[value] || value;
    }
    
    /**
     * Get UI configuration settings
     */
    getUISettings() {
        this._ensureLoaded();
        return this.config.ui_settings || {};
    }
    
    /**
     * Get all data source configurations
     */
    getAllDataSources() {
        this._ensureLoaded();
        return this.config.data_sources;
    }
    
    /**
     * Build radio buttons for grouping selection
     */
    buildGroupingOptions(containerId, sourceName) {
        this._ensureLoaded();
        
        const container = document.getElementById(containerId);
        if (!container) {
            console.error(`Container ${containerId} not found`);
            return;
        }
        
        container.innerHTML = ''; // Clear existing
        
        const sourceConfig = this.getDataSource(sourceName);
        const validGroupings = sourceConfig.valid_groupings || [];
        const defaultGrouping = sourceConfig.default_grouping || validGroupings[0];
        
        validGroupings.forEach(dimName => {
            const dimConfig = this.getDimension(dimName);
            
            const wrapper = document.createElement('label');
            wrapper.className = 'dimension-checkbox';
            
            const radio = document.createElement('input');
            radio.type = 'radio';
            radio.name = 'groupBy';
            radio.id = `group-${dimName}`;
            radio.value = dimName;
            radio.checked = dimName === defaultGrouping;
            
            const label = document.createElement('span');
            label.textContent = dimConfig.label || dimName;
            
            wrapper.appendChild(radio);
            wrapper.appendChild(label);
            container.appendChild(wrapper);
        });
    }
    
    /**
     * Build filter dropdowns
     */
    buildFilters(containerId, sourceName) {
        this._ensureLoaded();
        
        const container = document.getElementById(containerId);
        if (!container) {
            console.error(`Container ${containerId} not found`);
            return;
        }
        
        container.innerHTML = ''; // Clear existing
        
        const filters = this.getFiltersForSource(sourceName);
        
        filters.forEach(filterName => {
            const dimConfig = this.getDimension(filterName);
            
            const wrapper = document.createElement('div');
            wrapper.className = 'filter-group';
            
            const label = document.createElement('label');
            label.textContent = dimConfig.label || filterName;
            label.setAttribute('for', `filter-${filterName}`);
            
            const select = document.createElement('select');
            select.id = `filter-${filterName}`;
            select.className = 'filter-select';
            
            // Add "All" option
            const allOption = document.createElement('option');
            allOption.value = 'all';
            allOption.textContent = 'All';
            select.appendChild(allOption);
            
            wrapper.appendChild(label);
            wrapper.appendChild(select);
            container.appendChild(wrapper);
        });
    }
    
    /**
     * Get the actual field name for a dimension in a specific data source
     */
    getFieldForDimension(dimension, sourceName) {
        const dimConfig = this.getDimension(dimension);
        
        // Check for alternate field names
        if (dimConfig.alternate_fields && dimConfig.alternate_fields[sourceName]) {
            return dimConfig.alternate_fields[sourceName];
        }
        
        return dimConfig.field || dimension;
    }
    
    /**
     * Aggregate data based on selected dimensions
     */
    aggregateData(data, dimensions, valueField, sourceName) {
        const aggregated = {};
        
        data.forEach(record => {
            // Build aggregation key
            const key = dimensions
                .map(dim => {
                    const field = this.getFieldForDimension(dim, sourceName);
                    return record[field] || 'Unknown';
                })
                .join('|');
            
            if (!aggregated[key]) {
                aggregated[key] = {
                    value: 0,
                    count: 0,
                    records: []
                };
                
                // Store dimension values
                dimensions.forEach(dim => {
                    const field = this.getFieldForDimension(dim, sourceName);
                    aggregated[key][dim] = record[field];
                });
            }
            
            aggregated[key].value += record[valueField] || 0;
            aggregated[key].count += 1;
            aggregated[key].records.push(record);
        });
        
        // Convert to array and sort by value
        return Object.entries(aggregated)
            .map(([key, data]) => ({
                key,
                ...data
            }))
            .sort((a, b) => b.value - a.value);
    }
    
    /**
     * Format a value based on field configuration
     */
    formatValue(value, format) {
        switch (format) {
            case 'currency':
                return this.formatCurrency(value);
            case 'number':
                return value.toLocaleString();
            case 'percent':
                return (value * 100).toFixed(1) + '%';
            default:
                return value;
        }
    }
    
    /**
     * Format currency values
     */
    formatCurrency(value) {
        const absValue = Math.abs(value);
        if (absValue >= 1e9) {
            return `$${(value / 1e9).toFixed(1)}B`;
        } else if (absValue >= 1e6) {
            return `$${(value / 1e6).toFixed(1)}M`;
        } else if (absValue >= 1e3) {
            return `$${(value / 1e3).toFixed(0)}K`;
        }
        return `$${value.toFixed(0)}`;
    }
    
    /**
     * Ensure configuration is loaded
     */
    _ensureLoaded() {
        if (!this.loaded) {
            throw new Error('Configuration not loaded. Call load() first.');
        }
    }
}

// Create singleton instance
const dataConfig = new DataConfig();

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { DataConfig, dataConfig };
}