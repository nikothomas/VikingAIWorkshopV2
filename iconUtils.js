// utils/iconUtils.js

// List of ocean/nature/science-related Font Awesome icons in Unicode
const OCEAN_NATURE_SCIENCE_ICON_UNICODES = [
    '\uf578', // Fish
    '\uf773', // Water
    '\uf06c', // Leaf
    '\uf4d8', // Seedling
    '\uf6fc', // Mountain
    '\uf0c3', // Flask
    '\uf5d2', // Atom
    '\uf1bb', // Tree
    '\uf0c2', // Cloud
    '\uf57d', // Globe
    '\uf185', // Sun
    '\uf610', // Microscope
    '\uf7c0', // Satellite
    '\uf5b0', // Telescope
    '\uf1e6', // Plug (for electricity/energy)
    '\uf72e', // Wind
    '\uf043', // Tint (water droplet)
    '\uf5c8', // DNA
    '\uf75f', // Molecular structure
    '\uf70e', // Snowflake
    '\uf740', // Temperature High
    '\uf750', // Temperature Low
    '\uf0e7', // Bolt (lightning)
    '\uf6e3', // Space Shuttle
    '\uf562', // Solar Panel
    '\uf0c4', // Cut (for DNA/genetics)
    '\uf72f', // Cloud with (Rain)
    '\uf75e', // Cloud with Moon
    '\uf48e', // Clipboard (for scientific data)
    '\uf492', // Vial
    '\uf471', // Paw (for zoology)
    '\uf472', // Paw Prints
    '\uf548', // Ruler
    '\uf12e', // Puzzle Piece (for problem-solving)
    '\uf7d9', // Tools (for engineering)
    '\uf121', // Code (for computational science)
    '\uf0eb', // Lightbulb (for ideas/innovation)
    '\uf542', // Project Diagram
    '\uf6cf', // Meteor
    '\uf753', // Thermometer
    '\uf06d', // Fire
    '\uf21e', // Heartbeat (for life sciences)
    '\uf48b', // Binoculars (for observation)
    '\uf002', // Magnifying Glass (for detailed examination)
];
// Specific icons for robot and final node
const ROBOT_ICON_UNICODE = '\uf544'; // Robot
const FINAL_NODE_ICON_UNICODE = '\uf6ff'; // Network wired (for the final node)

// Function to randomly select a Unicode icon from the list
function getRandomIconUnicode() {
    const randomIndex = Math.floor(Math.random() * OCEAN_NATURE_SCIENCE_ICON_UNICODES.length);
    return OCEAN_NATURE_SCIENCE_ICON_UNICODES[randomIndex];
}

// Function to get the robot icon
function getRobotIcon() {
    return ROBOT_ICON_UNICODE;
}

// Function to get the final node icon
function getFinalNodeIcon() {
    return FINAL_NODE_ICON_UNICODE;
}

// Export the necessary data and functions
module.exports = {
    getRandomIconUnicode,
    getRobotIcon,
    getFinalNodeIcon
};