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
    '\uf5b0'  // Telescope
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