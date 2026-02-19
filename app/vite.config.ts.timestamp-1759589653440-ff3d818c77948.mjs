// vite.config.ts
import { defineConfig } from "file:///root/mindworkflow/node_modules/vite/dist/node/index.js";
import react from "file:///root/mindworkflow/node_modules/@vitejs/plugin-react/dist/index.js";
var resolvedHost = process.env.VITE_HOST ?? "0.0.0.0";
var envPort = Number(process.env.VITE_PORT);
var resolvedPort = Number.isFinite(envPort) && envPort > 0 ? envPort : 5173;
var apiTarget = process.env.VITE_API_TARGET ?? "http://localhost:3001";
var vite_config_default = defineConfig({
  plugins: [react()],
  server: {
    host: resolvedHost,
    port: resolvedPort,
    allowedHosts: ["mindworkflow.com", "www.mindworkflow.com", "localhost", "127.0.0.1"],
    proxy: {
      "/api": {
        target: apiTarget,
        changeOrigin: true,
        secure: false,
        ws: true,
        configure: (proxy, _options) => {
          proxy.on("error", (err, _req, _res) => {
            console.log("proxy error", err);
          });
          proxy.on("proxyReq", (proxyReq, req, _res) => {
            console.log("Sending Request to the Target:", req.method, req.url);
          });
          proxy.on("proxyRes", (proxyRes, req, _res) => {
            console.log("Received Response from the Target:", proxyRes.statusCode, req.url);
          });
        }
      }
    }
  }
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCIvcm9vdC9taW5kd29ya2Zsb3cvYXBwXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ZpbGVuYW1lID0gXCIvcm9vdC9taW5kd29ya2Zsb3cvYXBwL3ZpdGUuY29uZmlnLnRzXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ltcG9ydF9tZXRhX3VybCA9IFwiZmlsZTovLy9yb290L21pbmR3b3JrZmxvdy9hcHAvdml0ZS5jb25maWcudHNcIjtpbXBvcnQgeyBkZWZpbmVDb25maWcgfSBmcm9tICd2aXRlJztcbmltcG9ydCByZWFjdCBmcm9tICdAdml0ZWpzL3BsdWdpbi1yZWFjdCc7XG5cbmNvbnN0IHJlc29sdmVkSG9zdCA9IHByb2Nlc3MuZW52LlZJVEVfSE9TVCA/PyAnMC4wLjAuMCc7XG5jb25zdCBlbnZQb3J0ID0gTnVtYmVyKHByb2Nlc3MuZW52LlZJVEVfUE9SVCk7XG5jb25zdCByZXNvbHZlZFBvcnQgPSBOdW1iZXIuaXNGaW5pdGUoZW52UG9ydCkgJiYgZW52UG9ydCA+IDAgPyBlbnZQb3J0IDogNTE3MztcbmNvbnN0IGFwaVRhcmdldCA9IHByb2Nlc3MuZW52LlZJVEVfQVBJX1RBUkdFVCA/PyAnaHR0cDovL2xvY2FsaG9zdDozMDAxJztcblxuZXhwb3J0IGRlZmF1bHQgZGVmaW5lQ29uZmlnKHtcbiAgcGx1Z2luczogW3JlYWN0KCldLFxuICBzZXJ2ZXI6IHtcbiAgICBob3N0OiByZXNvbHZlZEhvc3QsXG4gICAgcG9ydDogcmVzb2x2ZWRQb3J0LFxuICAgIGFsbG93ZWRIb3N0czogWydtaW5kd29ya2Zsb3cuY29tJywgJ3d3dy5taW5kd29ya2Zsb3cuY29tJywgJ2xvY2FsaG9zdCcsICcxMjcuMC4wLjEnXSxcbiAgICBwcm94eToge1xuICAgICAgJy9hcGknOiB7XG4gICAgICAgIHRhcmdldDogYXBpVGFyZ2V0LFxuICAgICAgICBjaGFuZ2VPcmlnaW46IHRydWUsXG4gICAgICAgIHNlY3VyZTogZmFsc2UsXG4gICAgICAgIHdzOiB0cnVlLFxuICAgICAgICBjb25maWd1cmU6IChwcm94eSwgX29wdGlvbnMpID0+IHtcbiAgICAgICAgICBwcm94eS5vbignZXJyb3InLCAoZXJyLCBfcmVxLCBfcmVzKSA9PiB7XG4gICAgICAgICAgICBjb25zb2xlLmxvZygncHJveHkgZXJyb3InLCBlcnIpO1xuICAgICAgICAgIH0pO1xuICAgICAgICAgIHByb3h5Lm9uKCdwcm94eVJlcScsIChwcm94eVJlcSwgcmVxLCBfcmVzKSA9PiB7XG4gICAgICAgICAgICBjb25zb2xlLmxvZygnU2VuZGluZyBSZXF1ZXN0IHRvIHRoZSBUYXJnZXQ6JywgcmVxLm1ldGhvZCwgcmVxLnVybCk7XG4gICAgICAgICAgfSk7XG4gICAgICAgICAgcHJveHkub24oJ3Byb3h5UmVzJywgKHByb3h5UmVzLCByZXEsIF9yZXMpID0+IHtcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKCdSZWNlaXZlZCBSZXNwb25zZSBmcm9tIHRoZSBUYXJnZXQ6JywgcHJveHlSZXMuc3RhdHVzQ29kZSwgcmVxLnVybCk7XG4gICAgICAgICAgfSk7XG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgIH0sXG4gIH0sXG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICI7QUFBb1AsU0FBUyxvQkFBb0I7QUFDalIsT0FBTyxXQUFXO0FBRWxCLElBQU0sZUFBZSxRQUFRLElBQUksYUFBYTtBQUM5QyxJQUFNLFVBQVUsT0FBTyxRQUFRLElBQUksU0FBUztBQUM1QyxJQUFNLGVBQWUsT0FBTyxTQUFTLE9BQU8sS0FBSyxVQUFVLElBQUksVUFBVTtBQUN6RSxJQUFNLFlBQVksUUFBUSxJQUFJLG1CQUFtQjtBQUVqRCxJQUFPLHNCQUFRLGFBQWE7QUFBQSxFQUMxQixTQUFTLENBQUMsTUFBTSxDQUFDO0FBQUEsRUFDakIsUUFBUTtBQUFBLElBQ04sTUFBTTtBQUFBLElBQ04sTUFBTTtBQUFBLElBQ04sY0FBYyxDQUFDLG9CQUFvQix3QkFBd0IsYUFBYSxXQUFXO0FBQUEsSUFDbkYsT0FBTztBQUFBLE1BQ0wsUUFBUTtBQUFBLFFBQ04sUUFBUTtBQUFBLFFBQ1IsY0FBYztBQUFBLFFBQ2QsUUFBUTtBQUFBLFFBQ1IsSUFBSTtBQUFBLFFBQ0osV0FBVyxDQUFDLE9BQU8sYUFBYTtBQUM5QixnQkFBTSxHQUFHLFNBQVMsQ0FBQyxLQUFLLE1BQU0sU0FBUztBQUNyQyxvQkFBUSxJQUFJLGVBQWUsR0FBRztBQUFBLFVBQ2hDLENBQUM7QUFDRCxnQkFBTSxHQUFHLFlBQVksQ0FBQyxVQUFVLEtBQUssU0FBUztBQUM1QyxvQkFBUSxJQUFJLGtDQUFrQyxJQUFJLFFBQVEsSUFBSSxHQUFHO0FBQUEsVUFDbkUsQ0FBQztBQUNELGdCQUFNLEdBQUcsWUFBWSxDQUFDLFVBQVUsS0FBSyxTQUFTO0FBQzVDLG9CQUFRLElBQUksc0NBQXNDLFNBQVMsWUFBWSxJQUFJLEdBQUc7QUFBQSxVQUNoRixDQUFDO0FBQUEsUUFDSDtBQUFBLE1BQ0Y7QUFBQSxJQUNGO0FBQUEsRUFDRjtBQUNGLENBQUM7IiwKICAibmFtZXMiOiBbXQp9Cg==
