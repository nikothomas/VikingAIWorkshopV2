const { getSupabase } = require('./db/supabase');

const CONNECTION_UPDATE_INTERVAL = 10000; // Update every 10 seconds
const CONNECTIONS_PER_GROUP1 = 2; // Exactly 2 connections per Group 1 node
const ZERO_UUID = '00000000-0000-0000-0000-000000000000';

async function updateConnections() {
    const supabase = getSupabase();

    try {
        // Fetch all players and connections
        const { data: group1Players, error: g1Error } = await supabase.from('vk_demo_db').select('id').eq('group_number', 1);
        const { data: group2Players, error: g2Error } = await supabase.from('vk_demo_db').select('id').eq('group_number', 2);
        const { data: finalNode, error: fnError } = await supabase.from('vk_demo_db').select('id').eq('group_number', -2).single();
        const { data: existingConnections, error: connError } = await supabase.from('connections').select('*');

        if (g1Error || g2Error || fnError || connError) {
            throw new Error('Error fetching data');
        }

        if (checkConditions(existingConnections, group1Players, group2Players, finalNode)) {
            console.log("All conditions met. No updates needed.");
            return;
        } else {
            console.log("Conditions not met. Recreating all connections.");

            // Clear all existing connections
            const { error: deleteError } = await supabase
                .from('connections')
                .delete()
                .gte('id', ZERO_UUID);  // This condition will be true for all valid UUIDs

            if (deleteError) {
                throw new Error('Error deleting existing connections: ' + deleteError.message);
            }

            const newConnections = createAllConnections(group1Players, group2Players, finalNode);

            // Insert new connections in batches to avoid potential limitations
            const batchSize = 100;
            for (let i = 0; i < newConnections.length; i += batchSize) {
                const batch = newConnections.slice(i, i + batchSize);
                const { error: insertError } = await supabase.from('connections').insert(batch);
                if (insertError) {
                    throw new Error('Error inserting new connections: ' + insertError.message);
                }
            }

            console.log(`Connections updated. Total new connections: ${newConnections.length}`);
        }

    } catch (error) {
        console.error('Error updating connections:', error);
    }
}

function checkConditions(connections, group1Players, group2Players, finalNode) {
    // Check if all existing connections are still valid
    const allConnectionsValid = connections.every(conn =>
        (group1Players.some(p => p.id === conn.source_user_id) || group2Players.some(p => p.id === conn.source_user_id)) &&
        (group2Players.some(p => p.id === conn.target_user_id) || conn.target_user_id === finalNode.id)
    );

    // Check if all Group 1 players have exactly 2 outgoing connections
    const allGroup1HaveCorrectConnections = group1Players.every(g1Player =>
        connections.filter(conn => conn.source_user_id === g1Player.id).length === CONNECTIONS_PER_GROUP1
    );

    // Check if all Group 2 players have approximately equally distributed inbound connections
    const group2InboundCounts = group2Players.map(g2Player =>
        connections.filter(conn => conn.target_user_id === g2Player.id).length
    );
    const minInbound = Math.min(...group2InboundCounts);
    const maxInbound = Math.max(...group2InboundCounts);
    const flexibleInboundConnections = maxInbound - minInbound <= 1;

    // Check if all Group 2 players are connected to the final node
    const allGroup2ConnectedToFinal = group2Players.every(g2Player =>
        connections.some(conn => conn.source_user_id === g2Player.id && conn.target_user_id === finalNode.id)
    );

    return allConnectionsValid && allGroup1HaveCorrectConnections && flexibleInboundConnections && allGroup2ConnectedToFinal;
}

function createAllConnections(group1Players, group2Players, finalNode) {
    let newConnections = [];

    // Connect all Group 2 players to the final node
    group2Players.forEach(g2Player => {
        newConnections.push({
            source_user_id: g2Player.id,
            target_user_id: finalNode.id,
            weight: 0.5
        });
    });

    // Distribute Group 1 connections evenly among Group 2 players
    let g2Index = 0;
    group1Players.forEach(g1Player => {
        for (let i = 0; i < CONNECTIONS_PER_GROUP1; i++) {
            newConnections.push({
                source_user_id: g1Player.id,
                target_user_id: group2Players[g2Index].id,
                weight: 0.5
            });
            g2Index = (g2Index + 1) % group2Players.length;
        }
    });

    return newConnections;
}

function startConnectionUpdates() {
    setInterval(updateConnections, CONNECTION_UPDATE_INTERVAL);
    console.log(`Connection updates started. Running every ${CONNECTION_UPDATE_INTERVAL / 1000} seconds.`);
}

startConnectionUpdates();

module.exports = { updateConnections };