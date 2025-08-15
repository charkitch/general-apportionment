/**
 * DHS Budget Trends - Bar chart visualization for year-over-year comparisons
 */

// Global variables
let currentData = null;
let currentSource = 'apportionment';
let currentMetric = 'amount';
let currentChartType = 'grouped';
let flatData = {};

// Chart dimensions
const margin = { top: 40, right: 120, bottom: 60, left: 80 };
let width, height;

// Scales and axes
let xScale, yScale, colorScale;
let xAxis, yAxis;

// SVG elements
let svg, g;

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

// buildMetricDropdown removed - each source has only one metric

/**
 * Load data for a specific source
 */
async function loadDataSource(sourceName) {
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
            throw new Error('Unexpected data format');
        }
        
        console.log(`Loaded ${flatData[sourceName].length} records for ${sourceName}`);
        
        // Update UI elements
        // buildMetricDropdown(); // Removed - each source has only one metric
        dataConfig.buildGroupingOptions('compareByOptions', sourceName, 'radio'); // Force radio buttons for trends
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
        
        if (!select) return;
        
        // Get unique values
        const values = [...new Set(data.map(d => d[field]))]
            .filter(v => v && v !== 'Unknown')
            .sort();
        
        // Keep "All" option and add values
        select.innerHTML = '<option value="all">All</option>';
        
        // Special handling for fiscal year - we'll handle this differently for trends
        if (filterName === 'fiscal_year') {
            // Don't populate fiscal year filter for trends view
            select.style.display = 'none';
            const label = select.previousElementSibling;
            if (label) label.style.display = 'none';
        } else {
            values.forEach(value => {
                const option = document.createElement('option');
                option.value = value;
                option.textContent = dataConfig.getFilterDisplay(filterName, value);
                select.appendChild(option);
            });
        }
    });
}

/**
 * Get selected comparison dimension
 */
function getSelectedComparison() {
    const selected = document.querySelector('#compareByOptions input[type="radio"]:checked');
    return selected ? selected.value : null;
}

/**
 * Get active filters (excluding fiscal year)
 */
function getActiveFilters() {
    const filters = {};
    const filterSelects = document.querySelectorAll('#filterRow select');
    const sourceName = document.getElementById('dataSource').value;
    
    filterSelects.forEach(select => {
        const filterName = select.id.replace('filter-', '');
        const value = select.value;
        // Skip fiscal year filter and 'all' values
        if (filterName !== 'fiscal_year' && value !== 'all') {
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
    const comparison = getSelectedComparison();
    
    if (!comparison) {
        showError('Please select a dimension to compare');
        return;
    }
    
    // Filter data
    let data = flatData[sourceName];
    if (!data) {
        showError('No data loaded');
        return;
    }
    
    // Apply filters (excluding fiscal year)
    const filters = getActiveFilters();
    Object.entries(filters).forEach(([field, value]) => {
        data = data.filter(d => {
            if (field === 'fiscal_year') {
                return d[field] === parseInt(value);
            }
            return d[field] === value;
        });
    });
    
    // Process data for trends
    const processedData = processDataForTrends(data, comparison);
    
    // Draw chart
    drawChart(processedData);
    
    // Update table
    updateTable(processedData);
    
    // Update info
    updateInfo(processedData);
}

/**
 * Process data for trends visualization
 */
function processDataForTrends(data, comparisonDim) {
    const sourceName = document.getElementById('dataSource').value;
    // Get the first (and only) metric for this data source
    const sourceConfig = dataConfig.getDataSource(currentSource);
    const metric = Object.keys(sourceConfig.value_fields)[0];
    
    // Group by comparison dimension and fiscal year
    const grouped = {};
    
    data.forEach(record => {
        const dimField = dataConfig.getFieldForDimension(comparisonDim, sourceName);
        let dimValue = record[dimField] || 'Unknown';
        
        // Apply standardization for display
        dimValue = dataConfig.getFilterDisplay(comparisonDim, dimValue);
        
        const year = record.fiscal_year;
        
        if (!grouped[dimValue]) {
            grouped[dimValue] = {};
        }
        
        if (!grouped[dimValue][year]) {
            grouped[dimValue][year] = 0;
        }
        
        grouped[dimValue][year] += record[metric] || 0;
    });
    
    // Convert to array format for D3
    const result = [];
    const allYears = new Set();
    
    // Collect all years
    Object.values(grouped).forEach(yearData => {
        Object.keys(yearData).forEach(year => allYears.add(parseInt(year)));
    });
    
    const years = Array.from(allYears).sort();
    
    // Create data structure
    Object.entries(grouped).forEach(([category, yearData]) => {
        // Use abbreviation for components in chart labels
        const displayCategory = (comparisonDim === 'component') 
            ? dataConfig.getLabelDisplay('component', category)
            : category;
            
        const item = {
            category: displayCategory,
            fullName: category,  // Store full name for table
            values: years.map(year => ({
                year: year,
                value: yearData[year] || 0
            })),
            total: Object.values(yearData).reduce((sum, val) => sum + val, 0)
        };
        
        // Calculate growth rate
        const firstYear = years[0];
        const lastYear = years[years.length - 1];
        const firstValue = yearData[firstYear] || 0;
        const lastValue = yearData[lastYear] || 0;
        
        if (firstValue > 0 && years.length > 1) {
            const yearsElapsed = lastYear - firstYear;
            item.growthRate = Math.pow(lastValue / firstValue, 1 / yearsElapsed) - 1;
        } else {
            item.growthRate = 0;
        }
        
        item.latestValue = yearData[lastYear] || 0;
        
        result.push(item);
    });
    
    // Sort data by total (descending)
    result.sort((a, b) => b.total - a.total);
    
    return {
        data: result,
        years: years,
        dimension: comparisonDim
    };
}

/**
 * Draw the chart
 */
function drawChart(processedData) {
    const container = document.getElementById('chart');
    
    // Clear previous chart
    container.innerHTML = '';
    
    // Calculate dimensions
    const containerRect = container.getBoundingClientRect();
    width = containerRect.width - margin.left - margin.right;
    height = Math.max(400, processedData.data.length * 30) - margin.top - margin.bottom;
    
    // Create SVG
    svg = d3.select(container)
        .append('svg')
        .attr('width', width + margin.left + margin.right)
        .attr('height', height + margin.top + margin.bottom);
    
    g = svg.append('g')
        .attr('transform', `translate(${margin.left},${margin.top})`);
    
    // Draw based on chart type
    switch (currentChartType) {
        case 'change':
            drawChangeChart(processedData);
            break;
        default: // 'grouped'
            drawGroupedChart(processedData);
    }
}

/**
 * Draw grouped bar chart
 */
function drawGroupedChart(processedData) {
    const { data, years } = processedData;
    
    // Scales
    const x0Scale = d3.scaleBand()
        .domain(data.map(d => d.category))
        .range([0, width])
        .padding(0.1);
    
    const x1Scale = d3.scaleBand()
        .domain(years)
        .range([0, x0Scale.bandwidth()])
        .padding(0.05);
    
    const yScale = d3.scaleLinear()
        .domain([0, d3.max(data, d => d3.max(d.values, v => v.value))])
        .nice()
        .range([height, 0]);
    
    const colorScale = d3.scaleOrdinal()
        .domain(years)
        .range(d3.schemeCategory10);
    
    // Axes
    g.append('g')
        .attr('class', 'x-axis axis')
        .attr('transform', `translate(0,${height})`)
        .call(d3.axisBottom(x0Scale));
    
    g.append('g')
        .attr('class', 'y-axis axis')
        .call(d3.axisLeft(yScale).tickFormat(d => formatValue(d)));
    
    // Bars
    const categoryGroups = g.selectAll('.category-group')
        .data(data)
        .enter().append('g')
        .attr('class', 'category-group')
        .attr('transform', d => `translate(${x0Scale(d.category)},0)`);
    
    categoryGroups.selectAll('.bar')
        .data(d => d.values)
        .enter().append('rect')
        .attr('class', 'bar')
        .attr('x', d => x1Scale(d.year))
        .attr('y', d => yScale(d.value))
        .attr('width', x1Scale.bandwidth())
        .attr('height', d => height - yScale(d.value))
        .attr('fill', d => colorScale(d.year))
        .on('mouseover', function(event, d) {
            const category = d3.select(this.parentNode).datum().category;
            showTooltip(event, {
                category: category,
                year: d.year,
                value: d.value
            });
        })
        .on('mouseout', hideTooltip);
    
    // Legend
    drawLegend(years, colorScale);
}

// Stacked chart removed - keeping only grouped and change views
/*
function drawStackedChart(processedData) {
    const { data, years } = processedData;
    
    // Prepare data for stacking
    const stackData = years.map(year => {
        const yearData = { year: year };
        data.forEach(d => {
            const value = d.values.find(v => v.year === year);
            yearData[d.category] = value ? value.value : 0;
        });
        return yearData;
    });
    
    const categories = data.map(d => d.category);
    const stack = d3.stack()
        .keys(categories)
        .order(d3.stackOrderNone)
        .offset(d3.stackOffsetNone);
    
    const series = stack(stackData);
    
    // Scales
    const xScale = d3.scaleBand()
        .domain(years)
        .range([0, width])
        .padding(0.1);
    
    const yScale = d3.scaleLinear()
        .domain([0, d3.max(series, d => d3.max(d, d => d[1]))])
        .nice()
        .range([height, 0]);
    
    const colorScale = d3.scaleOrdinal()
        .domain(categories)
        .range(d3.schemeTableau10);
    
    // Axes
    g.append('g')
        .attr('class', 'x-axis axis')
        .attr('transform', `translate(0,${height})`)
        .call(d3.axisBottom(xScale).tickFormat(d => `FY ${d}`));
    
    g.append('g')
        .attr('class', 'y-axis axis')
        .call(d3.axisLeft(yScale).tickFormat(d => formatValue(d)));
    
    // Bars
    g.selectAll('.series')
        .data(series)
        .enter().append('g')
        .attr('class', 'series')
        .attr('fill', d => colorScale(d.key))
        .selectAll('rect')
        .data(d => d)
        .enter().append('rect')
        .attr('x', d => xScale(d.data.year))
        .attr('y', d => yScale(d[1]))
        .attr('height', d => yScale(d[0]) - yScale(d[1]))
        .attr('width', xScale.bandwidth())
        .on('mouseover', function(event, d) {
            const category = d3.select(this.parentNode).datum().key;
            showTooltip(event, {
                category: category,
                year: d.data.year,
                value: d[1] - d[0]
            });
        })
        .on('mouseout', hideTooltip);
    
    // Legend
    drawLegend(categories.slice(0, 10), colorScale);
}

*/

// Percent chart removed - keeping only grouped and change views  
/*
function drawPercentChart(processedData) {
    const { data, years } = processedData;
    
    // Prepare data for stacking with percentages
    const stackData = years.map(year => {
        const yearData = { year: year };
        let total = 0;
        
        // Calculate total for the year
        data.forEach(d => {
            const value = d.values.find(v => v.year === year);
            total += value ? value.value : 0;
        });
        
        // Convert to percentages
        data.forEach(d => {
            const value = d.values.find(v => v.year === year);
            yearData[d.category] = total > 0 ? ((value ? value.value : 0) / total) * 100 : 0;
        });
        
        return yearData;
    });
    
    const categories = data.map(d => d.category);
    const stack = d3.stack()
        .keys(categories)
        .order(d3.stackOrderNone)
        .offset(d3.stackOffsetNone);
    
    const series = stack(stackData);
    
    // Scales
    const xScale = d3.scaleBand()
        .domain(years)
        .range([0, width])
        .padding(0.1);
    
    const yScale = d3.scaleLinear()
        .domain([0, 100])
        .range([height, 0]);
    
    const colorScale = d3.scaleOrdinal()
        .domain(categories)
        .range(d3.schemeTableau10);
    
    // Axes
    g.append('g')
        .attr('class', 'x-axis axis')
        .attr('transform', `translate(0,${height})`)
        .call(d3.axisBottom(xScale).tickFormat(d => `FY ${d}`));
    
    g.append('g')
        .attr('class', 'y-axis axis')
        .call(d3.axisLeft(yScale).tickFormat(d => d + '%'));
    
    // Bars
    g.selectAll('.series')
        .data(series)
        .enter().append('g')
        .attr('class', 'series')
        .attr('fill', d => colorScale(d.key))
        .selectAll('rect')
        .data(d => d)
        .enter().append('rect')
        .attr('x', d => xScale(d.data.year))
        .attr('y', d => yScale(d[1]))
        .attr('height', d => yScale(d[0]) - yScale(d[1]))
        .attr('width', xScale.bandwidth())
        .on('mouseover', function(event, d) {
            const category = d3.select(this.parentNode).datum().key;
            showTooltip(event, {
                category: category,
                year: d.data.year,
                value: d[1] - d[0],
                isPercent: true
            });
        })
        .on('mouseout', hideTooltip);
    
    // Legend
    drawLegend(categories.slice(0, 10), colorScale);
}

/**
 * Draw year-over-year change chart
 */
function drawChangeChart(processedData) {
    const { data, years } = processedData;
    
    if (years.length < 2) {
        showError('Need at least 2 years of data for change chart');
        return;
    }
    
    // Calculate year-over-year changes
    const changeData = data.map(d => {
        const changes = [];
        for (let i = 1; i < d.values.length; i++) {
            const prevValue = d.values[i - 1].value;
            const currValue = d.values[i].value;
            const change = prevValue > 0 ? ((currValue - prevValue) / prevValue) * 100 : 0;
            
            changes.push({
                category: d.category,
                year: d.values[i].year,
                change: change,
                prevValue: prevValue,
                currValue: currValue
            });
        }
        return {
            category: d.category,
            changes: changes,
            avgChange: d.growthRate * 100
        };
    });
    
    // Flatten for easier processing
    const allChanges = changeData.flatMap(d => 
        d.changes.map(c => ({ ...c, avgChange: d.avgChange }))
    );
    
    // Scales
    const xScale = d3.scaleBand()
        .domain(data.map(d => d.category))
        .range([0, width])
        .padding(0.1);
    
    const yScale = d3.scaleLinear()
        .domain(d3.extent(allChanges, d => d.change))
        .nice()
        .range([height, 0]);
    
    const colorScale = d3.scaleOrdinal()
        .domain(years.slice(1))
        .range(d3.schemeCategory10);
    
    // Axes
    g.append('g')
        .attr('class', 'x-axis axis')
        .attr('transform', `translate(0,${yScale(0)})`)
        .call(d3.axisBottom(xScale));
    
    g.append('g')
        .attr('class', 'y-axis axis')
        .call(d3.axisLeft(yScale).tickFormat(d => d + '%'));
    
    // Zero line
    g.append('line')
        .attr('x1', 0)
        .attr('x2', width)
        .attr('y1', yScale(0))
        .attr('y2', yScale(0))
        .attr('stroke', '#666')
        .attr('stroke-dasharray', '3,3');
    
    // Bars
    const barWidth = xScale.bandwidth() / (years.length - 1);
    
    g.selectAll('.change-bar')
        .data(allChanges)
        .enter().append('rect')
        .attr('class', 'change-bar bar')
        .attr('x', d => xScale(d.category) + (years.slice(1).indexOf(d.year) * barWidth))
        .attr('y', d => d.change >= 0 ? yScale(d.change) : yScale(0))
        .attr('width', barWidth - 2)
        .attr('height', d => Math.abs(yScale(d.change) - yScale(0)))
        .attr('fill', d => colorScale(d.year))
        .on('mouseover', function(event, d) {
            showTooltip(event, {
                category: d.category,
                year: d.year,
                change: d.change,
                prevValue: d.prevValue,
                currValue: d.currValue,
                isChange: true
            });
        })
        .on('mouseout', hideTooltip);
    
    // Legend
    drawLegend(years.slice(1).map(y => `${y-1}-${y}`), colorScale);
}

/**
 * Draw legend
 */
function drawLegend(items, colorScale) {
    const legendWidth = 100;
    const legendHeight = items.length * 20;
    
    const legend = svg.append('g')
        .attr('class', 'legend')
        .attr('transform', `translate(${width + margin.left + 20}, ${margin.top})`);
    
    const legendItems = legend.selectAll('.legend-item')
        .data(items)
        .enter().append('g')
        .attr('class', 'legend-item')
        .attr('transform', (d, i) => `translate(0, ${i * 20})`);
    
    legendItems.append('rect')
        .attr('width', 15)
        .attr('height', 15)
        .attr('fill', d => colorScale(d));
    
    legendItems.append('text')
        .attr('x', 20)
        .attr('y', 12)
        .text(d => typeof d === 'number' ? `FY ${d}` : d)
        .style('font-size', '12px');
}

/**
 * Format value for display
 */
function formatValue(value) {
    const sourceConfig = dataConfig.getDataSource(currentSource);
    const metricKey = Object.keys(sourceConfig.value_fields)[0];
    const metricConfig = sourceConfig.value_fields[metricKey];
    
    if (metricConfig.format === 'currency') {
        return dataConfig.formatCurrency(value);
    } else {
        return value.toLocaleString();
    }
}

/**
 * Show tooltip
 */
function showTooltip(event, data) {
    const tooltip = d3.select('#tooltip');
    let content = `<strong>${data.category}</strong><br>`;
    
    if (data.isChange) {
        content += `FY ${data.year-1} to FY ${data.year}<br>`;
        content += `Change: ${data.change.toFixed(1)}%<br>`;
        content += `Previous: ${formatValue(data.prevValue)}<br>`;
        content += `Current: ${formatValue(data.currValue)}`;
    } else if (data.isPercent) {
        content += `FY ${data.year}<br>`;
        content += `Share: ${data.value.toFixed(1)}%`;
    } else {
        content += `FY ${data.year}<br>`;
        content += `Value: ${formatValue(data.value)}`;
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
 * Update table with data
 */
function updateTable(processedData) {
    const { data, years, dimension } = processedData;
    
    // Prepare headers
    const dimConfig = dataConfig.getDimension(dimension);
    const dimLabel = dimConfig.label || dimension;
    const headers = [dimLabel];
    years.forEach(year => {
        headers.push(`FY ${year}`);
    });
    headers.push('Total');
    
    // Prepare table data
    const tableData = data.map(item => {
        const row = [item.fullName || item.category];
        years.forEach(year => {
            const value = item.values.find(v => v.year === year);
            row.push(formatValue(value ? value.value : 0));
        });
        row.push(formatValue(item.total));
        return row;
    });
    
    // Add totals row
    const totalsRow = ['TOTAL'];
    years.forEach(year => {
        const total = data.reduce((sum, item) => {
            const value = item.values.find(v => v.year === year);
            return sum + (value ? value.value : 0);
        }, 0);
        totalsRow.push(formatValue(total));
    });
    const grandTotal = data.reduce((sum, item) => sum + item.total, 0);
    totalsRow.push(formatValue(grandTotal));
    tableData.push(totalsRow);
    
    // Create table using standardized component
    createStandardTable({
        containerId: 'dataTable',
        headers: headers,
        data: tableData,
        filename: `dhs_budget_trends_${dimension}_${new Date().toISOString().split('T')[0]}.csv`,
        showTotal: true
    });
}

/**
 * Update info bar
 */
function updateInfo(processedData) {
    const { data, years } = processedData;
    
    // Calculate totals
    const latestYear = years[years.length - 1];
    const totalLatest = data.reduce((sum, d) => {
        const latestValue = d.values.find(v => v.year === latestYear);
        return sum + (latestValue ? latestValue.value : 0);
    }, 0);
    
    // Calculate average growth
    const growthRates = data
        .filter(d => d.growthRate !== 0)
        .map(d => d.growthRate);
    const avgGrowth = growthRates.length > 0 
        ? growthRates.reduce((sum, rate) => sum + rate, 0) / growthRates.length 
        : 0;
    
    // Update display
    document.getElementById('totalValue').textContent = formatValue(totalLatest);
    document.getElementById('categoryCount').textContent = data.length;
    document.getElementById('yearRange').textContent = `FY ${years[0]} - FY ${latestYear}`;
    document.getElementById('growthRate').textContent = `${(avgGrowth * 100).toFixed(1)}%`;
}

/**
 * Show loading state
 */
function showLoading() {
    document.getElementById('chart').innerHTML = 
        '<div class="loading">Loading data...</div>';
}

/**
 * Show error message
 */
function showError(message) {
    document.getElementById('chart').innerHTML = 
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
    
    // Metric change
    // Metric dropdown removed
    
    // Comparison dimension change
    document.getElementById('compareByOptions').addEventListener('change', () => {
        updateVisualization();
    });
    
    // Filter changes
    document.getElementById('filterRow').addEventListener('change', () => {
        updateVisualization();
    });
    
    // Chart type changes
    document.querySelectorAll('.chart-type-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.chart-type-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            currentChartType = e.target.dataset.type;
            updateVisualization();
        });
    });
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', init);