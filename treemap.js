// Global variables
let flatData = null;
let currentView = 'default';
let currentData = null;
let breadcrumbPath = [];

// Bureau colors - Tableau 20
const tableau20 = [
    '#1f77b4', '#aec7e8', '#ff7f0e', '#ffbb78', '#2ca02c',
    '#98df8a', '#d62728', '#ff9896', '#9467bd', '#c5b0d5',
    '#8c564b', '#c49c94', '#e377c2', '#f7b6d2', '#7f7f7f',
    '#c7c7c7', '#bcbd22', '#dbdb8d', '#17becf', '#9edae5'
];
const bureauColors = d3.scaleOrdinal(tableau20);

// Load flat data
console.log('Starting to load flat data...');
Promise.all([
    d3.json('data/dhs_budget_flat.json')
]).then(([data]) => {
    console.log('Flat data loaded successfully');
    console.log('Total records:', data.record_count);
    console.log('Fiscal years:', data.fiscal_years);
    console.log('Availability types:', data.availability_types);
    
    flatData = data;
    
    // Initialize
    updateVisualization();
    
    // Check for update metadata
    d3.json('data/update_metadata.json').then(updateMeta => {
        if (updateMeta && updateMeta.last_updated) {
            const updateDate = new Date(updateMeta.last_updated);
            const formattedDate = updateDate.toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            });
            
            // Add last updated info
            const infoDiv = d3.select('#info');
            infoDiv.append('div')
                .attr('class', 'stat')
                .html(`<span class="stat-label">Data Last Pulled from OpenOMB:</span> <span class="stat-value">${formattedDate}</span>`);
        }
    }).catch(err => console.log('No update metadata found'));
    
    // Remove loading message
    d3.select('#treemap').select('.loading').remove();
}).catch(error => {
    console.error('Error loading data:', error);
    d3.select('#treemap').select('.loading').text('Error loading data');
});

// Event handlers
d3.select('#yearFilter').on('change', updateVisualization);
d3.select('#availabilityFilter').on('change', updateVisualization);
d3.select('#aggregateBy').on('change', () => {
    currentView = d3.select('#aggregateBy').property('value');
    navigateToRoot();
});

function navigateToRoot() {
    breadcrumbPath = [];
    updateBreadcrumb();
    updateVisualization();
}

function buildHierarchy(records, aggregationLevel) {
    // Filter records based on year and availability filters
    const yearFilter = d3.select('#yearFilter').property('value');
    const availFilter = d3.select('#availabilityFilter').property('value');
    
    const filteredRecords = records.filter(r => {
        if (yearFilter !== 'all' && r.fiscal_year.toString() !== yearFilter) return false;
        if (availFilter !== 'all' && r.availability_type !== availFilter) return false;
        return true;
    });
    
    // Build hierarchy based on aggregation level
    const root = { name: 'DHS Total', children: [] };
    const groups = new Map();
    
    filteredRecords.forEach(record => {
        let groupKey, groupName, groupData;
        
        switch (aggregationLevel) {
            case 'bureau-only':
                groupKey = record.bureau;
                groupName = record.bureau;
                groupData = {
                    bureau: record.bureau,
                    bureau_full: record.bureau_full,
                    abbreviation: record.abbreviation
                };
                break;
            
            case 'by-year':
                groupKey = `${record.bureau}|${record.fiscal_year}`;
                groupName = `${record.bureau} - FY ${record.fiscal_year}`;
                groupData = {
                    bureau: record.bureau,
                    bureau_full: record.bureau_full,
                    abbreviation: record.abbreviation,
                    fiscal_year: record.fiscal_year,
                    name: `FY ${record.fiscal_year}`
                };
                break;
            
            case 'no-tas':
                groupKey = `${record.bureau}|${record.account}`;
                groupName = record.account;
                groupData = {
                    bureau: record.bureau,
                    bureau_full: record.bureau_full,
                    abbreviation: record.abbreviation,
                    account: record.account
                };
                break;
            
            case 'tas':
                // For TAS view, create bureau -> account -> tas hierarchy
                let bureauGroup = groups.get(record.bureau);
                if (!bureauGroup) {
                    bureauGroup = {
                        name: record.bureau,
                        bureau: record.bureau,
                        bureau_full: record.bureau_full,
                        abbreviation: record.abbreviation,
                        children: new Map()
                    };
                    groups.set(record.bureau, bureauGroup);
                }
                
                let accountGroup = bureauGroup.children.get(record.account);
                if (!accountGroup) {
                    accountGroup = {
                        name: record.account,
                        bureau: record.bureau,
                        bureau_full: record.bureau_full,
                        abbreviation: record.abbreviation,
                        account: record.account,
                        children: []
                    };
                    bureauGroup.children.set(record.account, accountGroup);
                }
                
                accountGroup.children.push({
                    name: record.tas,
                    bureau: record.bureau,
                    bureau_full: record.bureau_full,
                    abbreviation: record.abbreviation,
                    account: record.account,
                    tas: record.tas,
                    tas_full: record.tas_full,
                    amount: record.amount,
                    fiscal_year: record.fiscal_year,
                    availability_type: record.availability_type
                });
                return; // Skip to next record
            
            default: // 'default' - bureau -> account
                let bureauGroupDefault = groups.get(record.bureau);
                if (!bureauGroupDefault) {
                    bureauGroupDefault = {
                        name: record.bureau,
                        bureau: record.bureau,
                        bureau_full: record.bureau_full,
                        abbreviation: record.abbreviation,
                        children: new Map()
                    };
                    groups.set(record.bureau, bureauGroupDefault);
                }
                
                let accountKey = record.account;
                let accountGroupDefault = bureauGroupDefault.children.get(accountKey);
                if (!accountGroupDefault) {
                    accountGroupDefault = {
                        name: record.account,
                        bureau: record.bureau,
                        bureau_full: record.bureau_full,
                        abbreviation: record.abbreviation,
                        account: record.account,
                        amount: 0
                    };
                    bureauGroupDefault.children.set(accountKey, accountGroupDefault);
                }
                accountGroupDefault.amount += record.amount;
                return; // Skip to next record
        }
        
        // For non-hierarchical views
        if (aggregationLevel !== 'tas' && aggregationLevel !== 'default') {
            if (!groups.has(groupKey)) {
                groups.set(groupKey, {
                    name: groupName,
                    ...groupData,
                    amount: 0
                });
            }
            groups.get(groupKey).amount += record.amount;
        }
    });
    
    // Convert maps to arrays
    if (aggregationLevel === 'tas' || aggregationLevel === 'default') {
        groups.forEach(bureauGroup => {
            const bureauChildren = [];
            bureauGroup.children.forEach(child => {
                if (child.children) {
                    // TAS view
                    bureauChildren.push({
                        ...child,
                        children: child.children
                    });
                } else {
                    // Default view
                    bureauChildren.push(child);
                }
            });
            root.children.push({
                name: bureauGroup.name,
                bureau: bureauGroup.bureau,
                bureau_full: bureauGroup.bureau_full,
                abbreviation: bureauGroup.abbreviation,
                children: bureauChildren
            });
        });
    } else {
        root.children = Array.from(groups.values());
    }
    
    return root;
}

function updateVisualization() {
    if (!flatData) return;
    
    // Build hierarchy from flat data
    const hierarchyData = buildHierarchy(flatData.data, currentView);
    
    // Navigate to current breadcrumb level
    let displayData = hierarchyData;
    for (let step of breadcrumbPath) {
        const found = displayData.children?.find(d => d.name === step);
        if (!found) {
            navigateToRoot();
            return;
        }
        displayData = found;
    }
    
    currentData = displayData;
    
    // Create hierarchy and draw
    const hierarchy = d3.hierarchy(displayData)
        .sum(d => d.children ? 0 : (d.value || d.amount || 0))
        .sort((a, b) => b.value - a.value);
    
    drawTreemap(hierarchy);
    updateInfo(hierarchy);
}

function drawTreemap(hierarchyData) {
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
    
    treemap(hierarchyData);
    
    // Create nodes - use descendants() instead of leaves() to show all levels
    const nodes = container.selectAll('.node')
        .data(hierarchyData.descendants().filter(d => d.depth > 0))
        .enter()
        .append('div')
        .attr('class', 'node')
        .style('left', d => d.x0 + 'px')
        .style('top', d => d.y0 + 'px')
        .style('width', d => Math.max(0, d.x1 - d.x0) + 'px')
        .style('height', d => Math.max(0, d.y1 - d.y0) + 'px')
        .style('background-color', d => getNodeColor(d))
        .on('click', (event, d) => handleNodeClick(d))
        .on('mouseover', (event, d) => showTooltip(event, d))
        .on('mouseout', hideTooltip);
    
    // Add labels
    nodes.append('div')
        .attr('class', 'node-label')
        .html(d => {
            const width = d.x1 - d.x0;
            const height = d.y1 - d.y0;
            if (width < 50 || height < 30) return '';
            
            const data = d.data;
            
            // Build the label dynamically based on size
            let label = '';
            
            // Check if this is a bureau-level node
            if (data.name === data.bureau) {
                // Bureau-level node: use full name if it fits, otherwise abbreviation
                const fullName = data.bureau_full || data.bureau || data.name;
                const abbreviation = data.abbreviation;
                
                // Estimate if full name fits (rough calculation: ~8px per character)
                const estimatedWidth = fullName.length * 8;
                label = (estimatedWidth < width * 0.9) ? fullName : (abbreviation || fullName);
            } else if (data.bureau && data.abbreviation) {
                // Non-bureau node with bureau info
                const fullName = data.bureau_full || data.bureau;
                const abbreviation = data.abbreviation;
                
                // For child nodes, estimate space for bureau name + additional info
                const baseInfo = data.fiscal_year ? `FY ${data.fiscal_year}` : 
                                data.account ? data.account : 
                                data.name;
                
                // Check if full bureau name + info fits
                const fullLabel = `${fullName}<br/>${baseInfo}`;
                const estimatedWidth = Math.max(fullName.length, baseInfo.length) * 8;
                
                if (estimatedWidth < width * 0.9) {
                    label = fullLabel;
                } else {
                    label = `${abbreviation}<br/>${baseInfo}`;
                }
            } else {
                // No bureau info, use default label
                if (data.fiscal_year && data.name === String(data.fiscal_year)) {
                    label = `FY ${data.fiscal_year}`;
                } else {
                    label = data.label || data.name;
                }
            }
            
            return `<div>${label}</div>` +
                   (height > 40 ? `<div class="node-value">$${formatAmount(d.value)}</div>` : '');
        });
}

function getNodeColor(node) {
    // Color by bureau
    const bureau = node.data.bureau || node.parent?.data.bureau || node.data.name;
    return bureauColors(bureau);
}

function handleNodeClick(node) {
    if (node.parent && node.parent.data.name !== currentData.name) {
        // Build path to clicked node's parent
        const path = [];
        let current = node.parent;
        while (current && current.data.name !== currentData.name) {
            path.unshift(current.data.name);
            current = current.parent;
        }
        
        // Navigate to the clicked node's parent
        breadcrumbPath = [...breadcrumbPath, ...path];
        updateBreadcrumb();
        updateVisualization();
    }
}

function showTooltip(event, d) {
    const tooltip = d3.select('#tooltip');
    const data = d.data;
    
    let content = `<strong>${data.label || data.name}</strong><br>`;
    content += `Amount: $${formatAmount(d.value)}<br>`;
    
    if (data.bureau) content += `Bureau: ${data.bureau}<br>`;
    if (data.account) content += `Account: ${data.account}<br>`;
    if (data.tas) content += `TAS: ${data.tas}<br>`;
    if (data.availability_period) content += `Availability: ${data.availability_period}<br>`;
    if (data.fiscal_year) content += `Fiscal Year: ${data.fiscal_year}<br>`;
    
    tooltip.html(content)
        .style('left', (event.pageX + 10) + 'px')
        .style('top', (event.pageY - 10) + 'px')
        .style('opacity', 1);
}

function hideTooltip() {
    d3.select('#tooltip').style('opacity', 0);
}

function updateBreadcrumb() {
    const breadcrumb = d3.select('#breadcrumb');
    breadcrumb.html('');
    
    // Root
    breadcrumb.append('span')
        .text('DHS Total')
        .style('cursor', 'pointer')
        .style('text-decoration', 'underline')
        .on('click', navigateToRoot);
    
    // Path
    breadcrumbPath.forEach((step, i) => {
        breadcrumb.append('span').text(' > ');
        breadcrumb.append('span')
            .text(step)
            .style('cursor', 'pointer')
            .style('text-decoration', 'underline')
            .on('click', () => {
                breadcrumbPath = breadcrumbPath.slice(0, i + 1);
                updateBreadcrumb();
                updateVisualization();
            });
    });
}

function updateInfo(hierarchyData) {
    const total = hierarchyData.value;
    const count = hierarchyData.leaves().length;
    
    d3.select('#totalAmount').text('$' + formatAmount(total));
    d3.select('#itemCount').text(count);
    
    let selection = breadcrumbPath.length > 0 ? breadcrumbPath.join(' > ') : 'All DHS';
    
    const yearFilter = d3.select('#yearFilter').property('value');
    if (yearFilter !== 'all') {
        selection += ` (FY ${yearFilter})`;
    }
    
    d3.select('#selectionInfo').text(selection);
}

function formatAmount(amount) {
    if (amount >= 1e9) {
        return (amount / 1e9).toFixed(1) + 'B';
    } else if (amount >= 1e6) {
        return (amount / 1e6).toFixed(1) + 'M';
    } else if (amount >= 1e3) {
        return (amount / 1e3).toFixed(1) + 'K';
    }
    return amount.toFixed(0);
}