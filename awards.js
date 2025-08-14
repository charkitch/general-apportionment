// Awards Treemap Visualization - Using Flat Data
let flatData = null;

// Use the same colors as the budget treemap
const tableau20 = [
    '#1f77b4', '#aec7e8', '#ff7f0e', '#ffbb78', '#2ca02c',
    '#98df8a', '#d62728', '#ff9896', '#9467bd', '#c5b0d5',
    '#8c564b', '#c49c94', '#e377c2', '#f7b6d2', '#7f7f7f',
    '#c7c7c7', '#bcbd22', '#dbdb8d', '#17becf', '#9edae5'
];
const componentColors = d3.scaleOrdinal(tableau20);

// Load data and initialize
async function init() {
    try {
        // Load flat data
        const response = await fetch('processed_data/usaspending/awards_flat.json');
        flatData = await response.json();
        console.log('Loaded flat awards data:', flatData.length, 'records');
        
        // Load metadata for dropdown options
        const metaResponse = await fetch('processed_data/usaspending/awards_metadata.json');
        const metadata = await metaResponse.json();
        
        // Populate component dropdown
        const componentFilter = document.getElementById('componentFilter');
        metadata.components.forEach(component => {
            const option = document.createElement('option');
            option.value = component;
            option.textContent = component;
            componentFilter.appendChild(option);
        });
        
        // Populate award type dropdown
        const awardTypeFilter = document.getElementById('awardTypeFilter');
        metadata.award_types.forEach(type => {
            const option = document.createElement('option');
            option.value = type;
            option.textContent = type;
            awardTypeFilter.appendChild(option);
        });
        
        // Set up event listeners
        setupEventListeners();
        
        // Initial render
        updateVisualization();
        
    } catch (error) {
        console.error('Error loading data:', error);
        document.getElementById('treemap').innerHTML = '<div style="padding: 20px; color: red;">Failed to load data</div>';
    }
}

function setupEventListeners() {
    ['fiscalYear', 'componentFilter', 'awardTypeFilter'].forEach(id => {
        document.getElementById(id).addEventListener('change', updateVisualization);
    });
}

function filterData() {
    let filtered = [...flatData];
    
    // Filter by fiscal year
    const fiscalYear = document.getElementById('fiscalYear').value;
    filtered = filtered.filter(d => d.fiscal_year == fiscalYear);
    
    // Filter by component
    const component = document.getElementById('componentFilter').value;
    if (component !== 'all') {
        filtered = filtered.filter(d => d.component === component);
    }
    
    // Filter by award type
    const awardType = document.getElementById('awardTypeFilter').value;
    if (awardType !== 'all') {
        filtered = filtered.filter(d => d.award_type === awardType);
    }
    
    return filtered;
}

function aggregateData(data, groupBy) {
    const aggregated = {};
    
    data.forEach(record => {
        const key = groupBy(record);
        if (!aggregated[key]) {
            aggregated[key] = {
                obligations: 0,
                outlays: 0,
                count: 0,
                records: []
            };
        }
        aggregated[key].obligations += record.obligations;
        aggregated[key].outlays += record.outlays;
        aggregated[key].count += 1;
        aggregated[key].records.push(record);
    });
    
    return aggregated;
}

function buildHierarchy(filteredData) {
    const root = {
        name: 'DHS Awards',
        children: []
    };
    
    // Create flat structure - component + award type combinations
    const byComponentType = aggregateData(filteredData, d => `${d.component}|${d.award_type}`);
    
    Object.entries(byComponentType).forEach(([key, data]) => {
        const [component, ...awardTypeParts] = key.split('|');
        const awardType = awardTypeParts.join('|'); // Handle award types with | in name
        root.children.push({
            name: `${component} - ${awardType}`,
            component: component,
            award_type: awardType,
            value: data.obligations,
            count: data.count,
            label_component: component,
            label_award_type: awardType
        });
    });
    
    return root;
}

function getColor(node) {
    // Always use component colors
    if (node.component) {
        return componentColors(node.component);
    }
    
    // For nodes without component (like award type only view), use neutral
    return '#888';
}

function formatCurrency(value) {
    if (Math.abs(value) >= 1e9) {
        return `$${(value / 1e9).toFixed(2)}B`;
    } else if (Math.abs(value) >= 1e6) {
        return `$${(value / 1e6).toFixed(1)}M`;
    } else if (Math.abs(value) >= 1e3) {
        return `$${(value / 1e3).toFixed(0)}K`;
    }
    return `$${value.toFixed(0)}`;
}

function updateVisualization() {
    const container = document.getElementById('treemap');
    container.innerHTML = '';
    
    // Get filtered data
    const filteredData = filterData();
    if (filteredData.length === 0) {
        container.innerHTML = '<div style="padding: 20px;">No data matching filters</div>';
        return;
    }
    
    // Build hierarchy
    const hierarchyData = buildHierarchy(filteredData);
    
    // Update info
    const totalAmount = filteredData.reduce((sum, d) => sum + d.obligations, 0);
    document.getElementById('totalAmount').textContent = formatCurrency(totalAmount);
    document.getElementById('currentYear').textContent = `FY ${document.getElementById('fiscalYear').value}`;
    document.getElementById('awardCount').textContent = filteredData.length.toLocaleString();
    
    // Create treemap
    const width = container.clientWidth;
    const height = container.clientHeight;
    
    const treemap = d3.treemap()
        .size([width, height])
        .padding(1)
        .round(true);
    
    const root = d3.hierarchy(hierarchyData)
        .sum(d => Math.max(0, d.value || 0)) // Handle negative values
        .sort((a, b) => b.value - a.value);
    
    treemap(root);
    
    // Create nodes - show direct children of root only
    const nodes = root.children.filter(d => d.value > 0); // Only show positive values
    
    nodes.forEach(node => {
        const div = document.createElement('div');
        div.className = 'node';
        div.style.left = node.x0 + 'px';
        div.style.top = node.y0 + 'px';
        div.style.width = (node.x1 - node.x0) + 'px';
        div.style.height = (node.y1 - node.y0) + 'px';
        div.style.backgroundColor = getColor(node.data);
        
        // Add label if there's enough space
        const width = node.x1 - node.x0;
        const height = node.y1 - node.y0;
        
        if (width > 50 && height > 30) {
            const label = document.createElement('div');
            label.className = 'node-label';
            
            // Build label - always show component and award type
            let labelLines = [];
            
            if (node.data.label_component) {
                labelLines.push(node.data.label_component);
            }
            
            if (node.data.label_award_type) {
                labelLines.push(node.data.label_award_type);
            }
            
            label.innerHTML = `
                <div>${labelLines.join('<br>')}</div>
                ${height > 50 ? `<div class="node-value">${formatCurrency(node.data.value)}</div>` : ''}
            `;
            div.appendChild(label);
        }
        
        // Add hover tooltip
        div.addEventListener('mouseenter', (e) => showTooltip(e, node.data));
        div.addEventListener('mouseleave', hideTooltip);
        
        container.appendChild(div);
    });
    
    // Update legend
    updateLegend();
}

function showTooltip(event, data) {
    const tooltip = document.getElementById('tooltip');
    
    let content = `<strong>${data.component} - ${data.award_type}</strong><br>`;
    content += `Obligations: ${formatCurrency(data.value)}<br>`;
    
    if (data.count) {
        content += `Number of awards: ${data.count.toLocaleString()}`;
    }
    
    tooltip.innerHTML = content;
    tooltip.style.opacity = 1;
    
    // Position tooltip
    const rect = event.target.getBoundingClientRect();
    tooltip.style.left = rect.left + 'px';
    tooltip.style.top = (rect.top - tooltip.offsetHeight - 5) + 'px';
}

function hideTooltip() {
    document.getElementById('tooltip').style.opacity = 0;
}

function updateLegend() {
    const content = document.getElementById('legend-content');
    content.innerHTML = '';
    
    // Always show component colors
    const components = new Set();
    if (flatData) {
        const filteredData = filterData();
        filteredData.forEach(d => components.add(d.component));
    }
    
    Array.from(components).sort().forEach(component => {
        const item = document.createElement('div');
        item.className = 'legend-item';
        item.innerHTML = `
            <div class="legend-color" style="background: ${componentColors(component)}"></div>
            <span>${component}</span>
        `;
        content.appendChild(item);
    });
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', init);