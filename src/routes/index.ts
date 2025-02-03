import authenticationRoutes from "./authentication/index.js";
import tableRoutes from './table/index.js';

// Define the project routes as an array of objects.
const projectRoutes = [
  {
    path: "/auth", // The base path for authentication routes.
    component: authenticationRoutes,
  },
  {
    path: "/table",
    component: tableRoutes,
  },
];

// Export the project routes for use in other parts of the application.
export default projectRoutes;
