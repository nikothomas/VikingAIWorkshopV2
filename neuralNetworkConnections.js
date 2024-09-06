const { getSupabase } = require('./db/supabase');

// Interval settings
const CONNECTION_UPDATE_INTERVAL = 5000; // Update every 5 second
const CONNECTIONS_PER_GROUP1 = 2; // Exactly 2 connections per Group 1 node

async function updateConnections() {
    const supabase = getSupabase();

    try {

        // Fetch all players in Group 1, Group 2, and the final node (Group -2)
        const { data: group1Players, error: g1Error } = await supabase.from('vk_demo_db').select('id').eq('group_number', 1);
        const { data: group2Players, error: g2Error } = await supabase.from('vk_demo_db').select('id').eq('group_number', 2);
        const { data: finalNode, error: fnError } = await supabase.from('vk_demo_db').select('id').eq('group_number', -2).single();

        if (g1Error || g2Error || fnError) {
            throw new Error('Error fetching players or final node bot');
        }

        // Fetch existing connections
        const { data: existingConnections, error: connError } = await supabase.from('connections').select('*');
        if (connError) throw new Error('Error fetching existing connections');

        // Check if base conditions are met
        const baseConditionsMet = checkBaseConditions(existingConnections, group1Players, group2Players, finalNode);

        let updatedConnections;

        if (baseConditionsMet) {
            updatedConnections = updateExistingConnections(existingConnections, group1Players, group2Players, finalNode);
        } else {
            console.log("Base conditions not met. Forcing complete update of all connections.");
            updatedConnections = createAllConnections(group1Players, group2Players, finalNode);
        }

        // Identify connections to add or update
        const connectionsToUpsert = updatedConnections.filter(conn => {
            const existingConn = existingConnections.find(existConn =>
                existConn.source_user_id === conn.source_user_id &&
                existConn.target_user_id === conn.target_user_id
            );
            // If the connection exists, use its current weight
            if (existingConn) {
                conn.weight = existingConn.weight;
                return false; // Don't upsert existing connections
            }
            return true; // Upsert only new connections
        });

        // Identify connections to delete
        const connectionsToDelete = existingConnections.filter(existConn =>
            !updatedConnections.some(conn =>
                conn.source_user_id === existConn.source_user_id &&
                conn.target_user_id === existConn.target_user_id
            )
        );

        // Update the `connections` table
        if (connectionsToUpsert.length > 0) {
            const { error: upsertError } = await supabase
                .from('connections')
                .insert(connectionsToUpsert); // Changed from upsert to insert

            if (upsertError) throw upsertError;
        }

        if (connectionsToDelete.length > 0) {
            const { error: deleteError } = await supabase
                .from('connections')
                .delete()
                .in('id', connectionsToDelete.map(conn => conn.id));

            if (deleteError) throw deleteError;
        }

        console.log(`Connections updated. Added/Updated: ${connectionsToUpsert.length}, Deleted: ${connectionsToDelete.length}`);

    } catch (error) {
        console.error('Error updating connections:', error);
    }
}

function checkBaseConditions(connections, group1Players, group2Players, finalNode) {
    // Check if all Group 2 players are connected to the final node
    const allGroup2ConnectedToFinal = group2Players.every(g2Player =>
        connections.some(conn => conn.source_user_id === g2Player.id && conn.target_user_id === finalNode.id)
    );

    // Check if all Group 1 players have exactly CONNECTIONS_PER_GROUP1 connections
    const allGroup1HaveCorrectConnections = group1Players.every(g1Player =>
        connections.filter(conn => conn.source_user_id === g1Player.id).length === CONNECTIONS_PER_GROUP1
    );

    // Check if all Group 2 players have at least one Group 1 connection
    const allGroup2HaveGroup1Connection = group2Players.every(g2Player =>
        connections.some(conn => conn.target_user_id === g2Player.id && group1Players.some(g1 => g1.id === conn.source_user_id))
    );

    return allGroup2ConnectedToFinal && allGroup1HaveCorrectConnections && allGroup2HaveGroup1Connection;
}

function updateExistingConnections(existingConnections, group1Players, group2Players, finalNode) {
    let updatedConnections = [...existingConnections];

    // Identify invalid connections (connections to deleted users or users who changed groups)
    const invalidConnections = updatedConnections.filter(conn => {
        const sourceExists = group1Players.some(p => p.id === conn.source_user_id) ||
            group2Players.some(p => p.id === conn.source_user_id) ||
            conn.source_user_id === finalNode.id;
        const targetExists = group2Players.some(p => p.id === conn.target_user_id) ||
            conn.target_user_id === finalNode.id;
        return !sourceExists || !targetExists;
    });

    // Remove invalid connections
    updatedConnections = updatedConnections.filter(conn => !invalidConnections.includes(conn));

    // Ensure all Group 2 players are connected to the final node
    group2Players.forEach(group2Player => {
        const existingConnection = updatedConnections.find(conn =>
            conn.source_user_id === group2Player.id && conn.target_user_id === finalNode.id
        );
        if (!existingConnection) {
            updatedConnections.push({
                source_user_id: group2Player.id,
                target_user_id: finalNode.id,
                weight: 0.5 // Only use default weight for new connections
            });
        }
    });

    // Ensure each Group 1 player has exactly CONNECTIONS_PER_GROUP1 connections
    group1Players.forEach(group1Player => {
        const currentConnections = updatedConnections.filter(conn => conn.source_user_id === group1Player.id);
        const neededConnections = CONNECTIONS_PER_GROUP1 - currentConnections.length;

        if (neededConnections > 0) {
            const availableGroup2Players = group2Players.filter(g2Player =>
                !updatedConnections.some(conn =>
                    conn.source_user_id === group1Player.id && conn.target_user_id === g2Player.id
                )
            );

            for (let i = 0; i < neededConnections && i < availableGroup2Players.length; i++) {
                updatedConnections.push({
                    source_user_id: group1Player.id,
                    target_user_id: availableGroup2Players[i].id,
                    weight: 0.5 // Only use default weight for new connections
                });
            }
        } else if (neededConnections < 0) {
            // Remove excess connections (unchanged)
        }
    });
    // Ensure each Group 2 player has at least one Group 1 connection
    group2Players.forEach(group2Player => {
        const hasGroup1Connection = updatedConnections.some(conn =>
            conn.target_user_id === group2Player.id && group1Players.some(g1 => g1.id === conn.source_user_id)
        );

        if (!hasGroup1Connection) {
            const availableGroup1Player = group1Players.find(g1Player =>
                updatedConnections.filter(conn => conn.source_user_id === g1Player.id).length < CONNECTIONS_PER_GROUP1
            );

            if (availableGroup1Player) {
                updatedConnections.push({
                    source_user_id: availableGroup1Player.id,
                    target_user_id: group2Player.id,
                    weight: 0.5
                });
            }
        }
    });

    return updatedConnections;
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

    // Connect Group 1 players to Group 2 players
    group1Players.forEach(g1Player => {
        const availableG2Players = [...group2Players];
        for (let i = 0; i < CONNECTIONS_PER_GROUP1; i++) {
            if (availableG2Players.length > 0) {
                const randomIndex = Math.floor(Math.random() * availableG2Players.length);
                const g2Player = availableG2Players.splice(randomIndex, 1)[0];
                newConnections.push({
                    source_user_id: g1Player.id,
                    target_user_id: g2Player.id,
                    weight: 0.5
                });
            }
        }
    });

    // Ensure all Group 2 players have at least one Group 1 connection
    group2Players.forEach(g2Player => {
        if (!newConnections.some(conn => conn.target_user_id === g2Player.id && group1Players.some(g1 => g1.id === conn.source_user_id))) {
            const availableG1Player = group1Players.find(g1Player =>
                newConnections.filter(conn => conn.source_user_id === g1Player.id).length < CONNECTIONS_PER_GROUP1
            );
            if (availableG1Player) {
                newConnections.push({
                    source_user_id: availableG1Player.id,
                    target_user_id: g2Player.id,
                    weight: 0.5
                });
            }
        }
    });

    return newConnections;
}

// Start the connection updates in the background
function startConnectionUpdates() {
    setInterval(updateConnections, CONNECTION_UPDATE_INTERVAL);
    console.log(`Connection updates started. Running every ${CONNECTION_UPDATE_INTERVAL / 1000} seconds.`);
}

// Start the process immediately when this file is executed
startConnectionUpdates();

module.exports = {
    updateConnections
};