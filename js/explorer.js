/**
 * DHS Budget Explorer - Main visualization logic
 * Dynamically builds UI and visualizations based on configuration
 */

// Global variables
let currentData = null;
let currentSource = 'apportionment';
let currentYear = null;
let flatData = {};  // Store loaded data by source

// Color scale
const tableau20 = [
    '#1f77b4', '#aec7e8', '#ff7f0e', '#ffbb78', '#2ca02c',
    '#98df8a', '#d62728', '#ff9896', '#9467bd', '#c5b0d5',
    '#8c564b', '#c49c94', '#e377c2', '#f7b6d2', '#7f7f7f',
    '#c7c7c7', '#bcbd22', '#dbdb8d', '#17becf', '#9edae5'
];
const colorScale = d3.scaleOrdinal(tableau20);

/**
 * Initialize the application
 */
async function init() {
    try {
        // Load configuration
        await dataConfig.load();
        console.log('Configuration loaded successfully');
        
        // Build UI elements
        buildDataSourceDropdown();
        
        // Load initial data
        await loadDataSource(currentSource);
        
        // Set up event handlers
        setupEventHandlers();
        
        // Initial visualization
        updateVisualization();
        
    } catch (error) {
        console.error('Failed to initialize:', error);
        showError('Failed to load configuration. Please refresh the page.');
    }
}

/**
 * Build data source dropdown
 */
function buildDataSourceDropdown() {
    const select = document.getElementById('dataSource');
    select.innerHTML = '';
    
    const sources = dataConfig.getAllDataSources();
    Object.entries(sources).forEach(([key, config]) => {
        const option = document.createElement('option');
        option.value = key;
        option.textContent = config.label;
        select.appendChild(option);
    });
    
    select.value = currentSource;
}

/**
 * Get the value field for current data source
 */
function getValueField() {
    const valueFields = dataConfig.getValueFieldsForSource(currentSource);
    // Return the first (and usually only) value field
    return Object.keys(valueFields)[0];
}

/**
 * Load data for a specific source
 */
async function loadDataSource(sourceName) {
    // Show loading
    showLoading();
    
    try {
        const sourceConfig = dataConfig.getDataSource(sourceName);
        const response = await fetch(sourceConfig.file);
        const data = await response.json();
        
        // Handle different data formats
        if (Array.isArray(data)) {
            flatData[sourceName] = data;
        } else if (data.data && Array.isArray(data.data)) {
            flatData[sourceName] = data.data;
        } else {
            console.error('Unexpected data format:', data);
            throw new Error('Unexpected data format');
        }
        
        console.log(`Loaded ${flatData[sourceName].length} records for ${sourceName}`);
        
        // Update UI elements
        dataConfig.buildGroupingOptions('groupByOptions', sourceName);
        dataConfig.buildFilters('filterRow', sourceName);
        
        // Populate filter options
        populateFilterOptions(sourceName);
        
    } catch (error) {
        console.error(`Failed to load data for ${sourceName}:`, error);
        showError(`Failed to load ${sourceName} data`);
    }
}


/**
 * Populate filter dropdown options
 */
function populateFilterOptions(sourceName) {
    const data = flatData[sourceName];
    if (!data) return;
    
    const filters = dataConfig.getFiltersForSource(sourceName);
    
    filters.forEach(filterName => {
        const field = dataConfig.getFieldForDimension(filterName, sourceName);
        const select = document.getElementById(`filter-${filterName}`);
        
        if (!select) {
            console.error(`No select element found for filter: ${filterName}`);
            return;
        }
        
        console.log(`Processing filter ${filterName} with field ${field}`);
        
        // Get unique values
        const values = [...new Set(data.map(d => d[field]))]
            .filter(v => v && v !== 'Unknown')
            .sort();
            
        console.log(`Found ${values.length} unique values for ${field}`);
        
        // Keep "All" option and add values
        select.innerHTML = '<option value="all">All</option>';
        
        // Special handling for fiscal year
        if (filterName === 'fiscal_year') {
            values.sort((a, b) => b - a); // Sort years descending
            values.forEach(value => {
                const option = document.createElement('option');
                option.value = value;
                option.textContent = `FY ${value}`;
                select.appendChild(option);
            });
        } else {
            values.forEach(value => {
                const option = document.createElement('option');
                option.value = value;
                option.textContent = dataConfig.getAbbreviation(filterName, value);
                select.appendChild(option);
            });
        }
        
        console.log(`Populated ${filterName} with ${values.length} options`);
    });
}

/**
 * Get selected grouping dimension
 */
function getSelectedGrouping() {
    const selected = document.querySelector('#groupByOptions input[type="radio"]:checked');
    return selected ? selected.value : null;
}

/**
 * Get active filters
 */
function getActiveFilters() {
    const filters = {};
    const filterSelects = document.querySelectorAll('#filterRow select');
    const sourceName = document.getElementById('dataSource').value;
    
    filterSelects.forEach(select => {
        const filterName = select.id.replace('filter-', '');
        const value = select.value;
        if (value !== 'all') {
            const field = dataConfig.getFieldForDimension(filterName, sourceName);
            filters[field] = value;
        }
    });
    
    return filters;
}

/**
 * Update visualization
 */
function updateVisualization() {
    const sourceName = document.getElementById('dataSource').value;
    const valueField = getValueField();
    const grouping = getSelectedGrouping();
    
    // Validate grouping
    if (!grouping) {
        showError('Please select a dimension to group by');
        return;
    }
    
    // Use array for consistency with existing code
    const dimensions = [grouping];
    
    // Filter data
    let data = flatData[sourceName];
    if (!data) {
        showError('No data loaded');
        return;
    }
    
    // Apply filters
    const filters = getActiveFilters();
    Object.entries(filters).forEach(([field, value]) => {
        data = data.filter(d => {
            // Handle type conversion for numeric fields like fiscal_year
            if (field === 'fiscal_year') {
                return d[field] === parseInt(value);
            }
            return d[field] === value;
        });
    });
    
    // Aggregate data
    const aggregated = dataConfig.aggregateData(data, dimensions, valueField, sourceName);
    
    console.log(`Aggregated ${data.length} records into ${aggregated.length} groups`);
    console.log('Top 5 groups:', aggregated.slice(0, 5));
    
    // Build hierarchy for treemap
    const hierarchy = buildHierarchy(aggregated, dimensions);
    
    // Draw treemap
    drawTreemap(hierarchy, valueField);
    
    // Update info
    updateInfo(aggregated, dimensions);
}

/**
 * Build hierarchy from aggregated data
 */
function buildHierarchy(aggregatedData, dimensions) {
    // For single dimension, create simple hierarchy
    if (dimensions.length === 1) {
        return {
            name: 'Total',
            children: aggregatedData.map(item => ({
                name: item[dimensions[0]] || 'Unknown',
                value: item.value,
                data: item
            }))
        };
    }
    
    // For multiple dimensions, create nested hierarchy
    const root = { name: 'Total', children: [] };
    const nodeMap = new Map();
    
    aggregatedData.forEach(item => {
        let currentLevel = root;
        
        dimensions.forEach((dim, index) => {
            const value = item[dim] || 'Unknown';
            const path = dimensions.slice(0, index + 1).map(d => item[d]).join('|');
            
            if (!nodeMap.has(path)) {
                const node = {
                    name: value,
                    dimension: dim,
                    data: {}
                };
                
                // Copy dimension values
                dimensions.slice(0, index + 1).forEach(d => {
                    node.data[d] = item[d];
                });
                
                if (index === dimensions.length - 1) {
                    // Leaf node
                    node.value = item.value;
                    node.data = item;
                } else {
                    // Branch node
                    node.children = [];
                }
                
                if (!currentLevel.children) {
                    currentLevel.children = [];
                }
                currentLevel.children.push(node);
                nodeMap.set(path, node);
            }
            
            currentLevel = nodeMap.get(path);
        });
    });
    
    return root;
}

/**
 * Draw treemap
 */
function drawTreemap(hierarchyData, valueField) {
    const container = d3.select('#treemap');
    const width = container.node().offsetWidth;
    const height = container.node().offsetHeight;
    
    // Clear previous
    container.selectAll('.node').remove();
    
    // Create treemap layout
    const treemap = d3.treemap()
        .size([width, height])
        .padding(2)
        .round(true);
    
    // Create hierarchy
    const root = d3.hierarchy(hierarchyData)
        .sum(d => d.value || 0)
        .sort((a, b) => b.value - a.value);
    
    treemap(root);
    
    // Get UI settings
    const uiSettings = dataConfig.getUISettings();
    const minLabelWidth = uiSettings.treemap?.min_label_width || 30;
    const minLabelHeight = uiSettings.treemap?.min_label_height || 20;
    
    // Create nodes
    const nodes = container.selectAll('.node')
        .data(root.leaves())
        .enter()
        .append('div')
        .attr('class', 'node')
        .style('left', d => d.x0 + 'px')
        .style('top', d => d.y0 + 'px')
        .style('width', d => Math.max(0, d.x1 - d.x0) + 'px')
        .style('height', d => Math.max(0, d.y1 - d.y0) + 'px')
        .style('background-color', d => {
            const colorDim = uiSettings.colors?.by_dimension || 'component';
            // Handle nested data structure
            const data = d.data.data || d.data;
            const colorValue = data[colorDim] || data.name || 'Unknown';
            return colorScale(colorValue);
        })
        .on('click', (event, d) => handleNodeClick(d))
        .on('mouseover', (event, d) => showTooltip(event, d, valueField))
        .on('mouseout', hideTooltip);
    
    // Add labels
    nodes.append('div')
        .attr('class', 'node-label')
        .html(d => {
            const width = d.x1 - d.x0;
            const height = d.y1 - d.y0;
            
            if (width < minLabelWidth || height < minLabelHeight) return '';
            
            const data = d.data.data;
            const grouping = getSelectedGrouping();
            
            // Build label from grouping dimension
            const value = data[grouping] || 'Unknown';
            const label = dataConfig.getAbbreviation(grouping, value);
            const valueFormatted = dataConfig.formatCurrency(d.value);
            
            return `<div>${label}</div>` +
                   (height > 40 ? `<div class="node-value">${valueFormatted}</div>` : '');
        });
}

/**
 * Show tooltip
 */
function showTooltip(event, d, valueField) {
    const tooltip = d3.select('#tooltip');
    const data = d.data.data;
    const grouping = getSelectedGrouping();
    const valueConfig = dataConfig.getValueFieldsForSource(currentSource)[valueField];
    
    let content = '<strong>';
    content += data[grouping] || 'Unknown';
    content += '</strong><br>';
    
    // Value
    content += `${valueConfig.label}: ${dataConfig.formatValue(d.value, valueConfig.format)}<br>`;
    
    // Additional info
    if (data.count) {
        content += `Records: ${data.count.toLocaleString()}<br>`;
    }
    
    // Show percentage if enabled
    const uiSettings = dataConfig.getUISettings();
    if (uiSettings.tooltips?.show_percentage) {
        const total = d.parent.value;
        const percentage = (d.value / total * 100).toFixed(1);
        content += `Share: ${percentage}%<br>`;
    }
    
    tooltip.html(content)
        .style('left', (event.pageX + 10) + 'px')
        .style('top', (event.pageY - 10) + 'px')
        .style('opacity', 1);
}

/**
 * Hide tooltip
 */
function hideTooltip() {
    d3.select('#tooltip').style('opacity', 0);
}

/**
 * Handle node click
 */
function handleNodeClick(node) {
    // Could implement drill-down or navigation to trends
    console.log('Clicked:', node.data);
}

/**
 * Update info bar
 */
function updateInfo(aggregatedData, dimensions) {
    const total = aggregatedData.reduce((sum, item) => sum + item.value, 0);
    const valueField = getValueField();
    const valueConfig = dataConfig.getValueFieldsForSource(currentSource)[valueField];
    
    document.getElementById('totalValue').textContent = 
        dataConfig.formatValue(total, valueConfig.format);
    document.getElementById('itemCount').textContent = 
        aggregatedData.length.toLocaleString();
    
    const dimConfig = dataConfig.getDimension(dimensions[0]);
    document.getElementById('groupingInfo').textContent = dimConfig.label || dimensions[0];
}


/**
 * Export data
 */
function exportData() {
    // TODO: Implement CSV/JSON export
    console.log('Export not yet implemented');
}

/**
 * Show loading state
 */
function showLoading() {
    document.getElementById('treemap').innerHTML = 
        '<div class="loading">Loading data...</div>';
}

/**
 * Show error message
 */
function showError(message) {
    document.getElementById('treemap').innerHTML = 
        `<div class="error">${message}</div>`;
}

/**
 * Set up event handlers
 */
function setupEventHandlers() {
    // Data source change
    document.getElementById('dataSource').addEventListener('change', async (e) => {
        currentSource = e.target.value;
        await loadDataSource(currentSource);
        updateVisualization();
    });
    
    // Auto-update on grouping change
    document.getElementById('groupByOptions').addEventListener('change', () => {
        updateVisualization();
    });
    
    // Auto-update on filter change
    document.getElementById('filterRow').addEventListener('change', () => {
        updateVisualization();
    });
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', init);