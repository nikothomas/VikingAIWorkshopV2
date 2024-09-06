document.addEventListener('DOMContentLoaded', async () => {
    const POLL_INTERVAL = 1000; // Poll every 1 seconds
    let svg = createSVG();

    let previousData = { nodes: [], links: [] }; // Store previous state

    // Initial fetch and render
    let data = await fetchData();
    updateNetworkVisualization(svg, data);
    previousData = data; // Store initial state

    // Polling to update the network visualization every 8 seconds
    setInterval(async () => {
        data = await fetchData();
        if (hasDataChanged(previousData, data)) {
            updateNetworkVisualization(svg, data); // Only update if data has changed
            previousData = data; // Update the previous state
        }
    }, POLL_INTERVAL);
});

function createSVG() {
    const width = document.getElementById('network-container').clientWidth;
    const height = document.getElementById('network-container').clientHeight;

    const svg = d3.select('#network-container').append('svg')
        .attr('width', '100%')
        .attr('height', '100%')
        .attr('viewBox', `0 0 ${width} ${height}`)
        .attr('preserveAspectRatio', 'xMidYMid meet');

    const containerGroup = svg.append('g');

    const zoom = d3.zoom()
        .scaleExtent([0.1, 5])
        .on('zoom', (event) => {
            containerGroup.attr('transform', event.transform);
        });

    svg.call(zoom);

    return containerGroup;
}

async function fetchData() {
    try {
        const response = await fetch('/api/get-network-data');
        if (!response.ok) {
            console.error(`HTTP error! Status: ${response.status}`);
            return { nodes: [], links: [] };
        }
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error fetching network data:', error);
        return { nodes: [], links: [] }; // Return empty data on error
    }
}

function updateNetworkVisualization(containerGroup, data) {
    const width = document.getElementById('network-container').clientWidth;
    const height = document.getElementById('network-container').clientHeight;

    const groups = [1, 2, -2];
    const groupSpacing = width / (groups.length + 1);

    const groupedNodes = d3.group(data.nodes, d => d.group);
    groups.forEach((group, groupIndex) => {
        const nodesInGroup = groupedNodes.get(group) || [];
        const verticalSpacing = height / (nodesInGroup.length + 1);
        nodesInGroup.forEach((node, nodeIndex) => {
            node.x = (groupIndex + 1) * groupSpacing;
            node.y = (nodeIndex + 1) * verticalSpacing;
        });
    });

    const nodeMap = new Map(data.nodes.map(node => [node.id, node]));
    const links = data.links.map(link => ({
        source: nodeMap.get(link.source),
        target: nodeMap.get(link.target)
    })).filter(link => link.source && link.target);

    const link = containerGroup.selectAll('.link')
        .data(links, d => `${d.source.id}-${d.target.id}`);

    link.exit().remove();

    link.enter().append('line')
        .attr('class', 'link')
        .merge(link)
        .attr('x1', d => d.source.x)
        .attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x)
        .attr('y2', d => d.target.y)
        .attr('stroke', '#999')
        .attr('stroke-opacity', 0.6);

    const node = containerGroup.selectAll('.node')
        .data(data.nodes, d => d.id);

    node.exit().remove();

    const nodeEnter = node.enter().append('g')
        .attr('class', 'node')
        .on('mouseover', mouseover)
        .on('mousemove', mousemove)
        .on('mouseleave', mouseleave);

    nodeEnter.append('text')
        .attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'central')
        .attr('font-family', 'FontAwesome')
        .attr('font-size', '20px')
        .attr('fill', d => d.hasGivenInput ? 'green' : 'red')
        .text(d => d.icon);

    containerGroup.selectAll('.node')
        .attr('transform', d => `translate(${d.x},${d.y})`);
}

// Tooltip styling and creation
const Tooltip = d3.select('body')
    .append('div')
    .style('opacity', 0)
    .attr('class', 'tooltip')
    .style('background-color', 'white')
    .style('border', 'solid')
    .style('border-width', '2px')
    .style('border-radius', '5px')
    .style('padding', '5px');

// Tooltip functions
function mouseover(event, d) {
    Tooltip.style('opacity', 1);
    d3.select(this).style('stroke', 'black').style('opacity', 1);
}

function mousemove(event, d) {
    const inboundLinks = data.links.filter(link => link.target === d.id);
    const outboundLinks = data.links.filter(link => link.source === d.id);

    const inboundIcons = inboundLinks.map(link => data.nodes.find(n => n.id === link.source).icon).join(' ');
    const outboundIcons = outboundLinks.map(link => data.nodes.find(n => n.id === link.target).icon).join(' ');

    const tooltipText = `Inbound: ${inboundIcons} \nOutbound: ${outboundIcons} \nWeight: ${d.weight || 0}`;

    Tooltip
        .html(tooltipText)
        .style('left', (event.pageX + 10) + 'px')
        .style('top', (event.pageY) + 'px');
}

function mouseleave(event, d) {
    Tooltip.style('opacity', 0);
    d3.select(this).style('stroke', 'none').style('opacity', 0.8);
}

function hasDataChanged(prevData, newData) {
    return (
        hasNodesChanged(prevData.nodes, newData.nodes) ||
        hasLinksChanged(prevData.links, newData.links)
    );
}

function hasNodesChanged(prevNodes, newNodes) {
    if (prevNodes.length !== newNodes.length) return true;

    const prevNodeMap = new Map(prevNodes.map(node => [node.id, node]));
    const newNodeMap = new Map(newNodes.map(node => [node.id, node]));

    for (let [id, newNode] of newNodeMap) {
        const prevNode = prevNodeMap.get(id);
        if (!prevNode || JSON.stringify(prevNode) !== JSON.stringify(newNode)) return true;
    }

    return false;
}

function hasLinksChanged(prevLinks, newLinks) {
    if (prevLinks.length !== newLinks.length) return true;

    const prevLinkSet = new Set(prevLinks.map(link => `${link.source}-${link.target}`));
    const newLinkSet = new Set(newLinks.map(link => `${link.source}-${link.target}`));

    return Array.from(newLinkSet).some(link => !prevLinkSet.has(link));
}