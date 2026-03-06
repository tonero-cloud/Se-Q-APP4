#!/usr/bin/env python3
"""
SafeGuard Backend API Testing Script
Tests the admin authentication and admin-specific endpoints.
"""

import asyncio
import aiohttp
import json
import logging
from datetime import datetime

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Base URL from frontend .env
BASE_URL = "https://escort-track-app.preview.emergentagent.com/api"

# Test credentials
ADMIN_EMAIL = "anthonyezedinachi@gmail.com"
ADMIN_PASSWORD = "Admin123!"

class SafeGuardAPITester:
    def __init__(self):
        self.session = None
        self.admin_token = None
        
    async def __aenter__(self):
        self.session = aiohttp.ClientSession()
        return self
        
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if self.session:
            await self.session.close()
    
    async def make_request(self, method, endpoint, headers=None, json_data=None):
        """Make HTTP request and return response data"""
        url = f"{BASE_URL}{endpoint}"
        
        try:
            async with self.session.request(method, url, headers=headers, json=json_data) as response:
                response_text = await response.text()
                
                logger.info(f"{method} {url} - Status: {response.status}")
                
                if response.headers.get('content-type', '').startswith('application/json'):
                    try:
                        response_data = json.loads(response_text)
                    except json.JSONDecodeError:
                        response_data = {"raw_response": response_text}
                else:
                    response_data = {"raw_response": response_text}
                
                return {
                    "status_code": response.status,
                    "data": response_data,
                    "success": 200 <= response.status < 300
                }
                
        except Exception as e:
            logger.error(f"Request failed for {method} {url}: {e}")
            return {
                "status_code": 0,
                "data": {"error": str(e)},
                "success": False
            }
    
    async def test_admin_login(self):
        """Test admin authentication"""
        logger.info("=== Testing Admin Authentication ===")
        
        payload = {
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        }
        
        result = await self.make_request("POST", "/auth/login", json_data=payload)
        
        if result["success"] and "token" in result["data"]:
            self.admin_token = result["data"]["token"]
            logger.info(f"✅ Admin login successful - Token: {self.admin_token[:20]}...")
            logger.info(f"   User ID: {result['data'].get('user_id')}")
            logger.info(f"   Role: {result['data'].get('role')}")
            return True
        else:
            logger.error(f"❌ Admin login failed: {result['data']}")
            return False
    
    def get_auth_headers(self):
        """Get authorization headers with admin token"""
        if not self.admin_token:
            return {}
        return {"Authorization": f"Bearer {self.admin_token}"}
    
    async def test_admin_clear_uploads(self):
        """Test DELETE /api/admin/clear-uploads"""
        logger.info("=== Testing Admin Clear Uploads ===")
        
        if not self.admin_token:
            logger.error("❌ No admin token available")
            return False
            
        result = await self.make_request(
            "DELETE", 
            "/admin/clear-uploads", 
            headers=self.get_auth_headers()
        )
        
        if result["success"]:
            data = result["data"]
            logger.info(f"✅ Clear uploads successful")
            logger.info(f"   Message: {data.get('message')}")
            logger.info(f"   Deleted records: {data.get('deleted_records')}")
            logger.info(f"   Deleted files: {data.get('deleted_files')}")
            return True
        else:
            logger.error(f"❌ Clear uploads failed: {result['data']}")
            return False
    
    async def test_admin_security_teams(self):
        """Test GET /api/admin/security-teams"""
        logger.info("=== Testing Admin Security Teams ===")
        
        if not self.admin_token:
            logger.error("❌ No admin token available")
            return False
            
        result = await self.make_request(
            "GET", 
            "/admin/security-teams", 
            headers=self.get_auth_headers()
        )
        
        if result["success"]:
            teams = result["data"]
            logger.info(f"✅ Security teams retrieved successfully")
            logger.info(f"   Number of teams: {len(teams) if isinstance(teams, list) else 'N/A'}")
            if isinstance(teams, list) and teams:
                for i, team in enumerate(teams[:3]):  # Show first 3 teams
                    logger.info(f"   Team {i+1}: {team.get('name', 'Unknown')} ({team.get('member_count', 0)} members)")
            return True
        else:
            logger.error(f"❌ Security teams failed: {result['data']}")
            return False
    
    async def test_admin_analytics(self):
        """Test GET /api/admin/analytics"""
        logger.info("=== Testing Admin Analytics ===")
        
        if not self.admin_token:
            logger.error("❌ No admin token available")
            return False
            
        result = await self.make_request(
            "GET", 
            "/admin/analytics", 
            headers=self.get_auth_headers()
        )
        
        if result["success"]:
            analytics = result["data"]
            logger.info(f"✅ Analytics retrieved successfully")
            logger.info(f"   Daily panics entries: {len(analytics.get('daily_panics', []))}")
            logger.info(f"   Categories: {len(analytics.get('categories', []))}")
            logger.info(f"   Total panics (30d): {analytics.get('total_panics_30d', 0)}")
            logger.info(f"   False alarm rate: {analytics.get('false_alarm_rate', 0)}%")
            return True
        else:
            logger.error(f"❌ Analytics failed: {result['data']}")
            return False
    
    async def test_admin_broadcast(self):
        """Test POST /api/admin/broadcast"""
        logger.info("=== Testing Admin Broadcast ===")
        
        if not self.admin_token:
            logger.error("❌ No admin token available")
            return False
            
        payload = {
            "title": "Test Broadcast",
            "message": "This is a test broadcast message from SafeGuard testing",
            "target_role": "all"
        }
        
        result = await self.make_request(
            "POST", 
            "/admin/broadcast", 
            headers=self.get_auth_headers(),
            json_data=payload
        )
        
        if result["success"]:
            data = result["data"]
            logger.info(f"✅ Broadcast sent successfully")
            logger.info(f"   Message: {data.get('message')}")
            logger.info(f"   Recipients: {data.get('recipients', 0)}")
            logger.info(f"   Push notifications sent: {data.get('push_sent', 0)}")
            return True
        else:
            logger.error(f"❌ Broadcast failed: {result['data']}")
            return False
    
    async def test_admin_audit_log(self):
        """Test GET /api/admin/audit-log"""
        logger.info("=== Testing Admin Audit Log ===")
        
        if not self.admin_token:
            logger.error("❌ No admin token available")
            return False
            
        result = await self.make_request(
            "GET", 
            "/admin/audit-log", 
            headers=self.get_auth_headers()
        )
        
        if result["success"]:
            audit_data = result["data"]
            logs = audit_data.get("logs", [])
            total = audit_data.get("total", 0)
            logger.info(f"✅ Audit log retrieved successfully")
            logger.info(f"   Total audit entries: {total}")
            logger.info(f"   Retrieved entries: {len(logs)}")
            if logs:
                recent = logs[0]
                logger.info(f"   Latest action: {recent.get('action')} by {recent.get('admin_name', 'Unknown')}")
            return True
        else:
            logger.error(f"❌ Audit log failed: {result['data']}")
            return False
    
    async def run_all_tests(self):
        """Run all admin API tests"""
        logger.info("🚀 Starting SafeGuard Admin API Tests")
        logger.info(f"Backend URL: {BASE_URL}")
        logger.info(f"Admin Email: {ADMIN_EMAIL}")
        logger.info("="*60)
        
        test_results = {}
        
        # Test 1: Admin Login
        test_results["admin_login"] = await self.test_admin_login()
        
        if not test_results["admin_login"]:
            logger.error("🛑 Admin login failed - stopping tests")
            return test_results
        
        # Test 2: Admin Clear Uploads
        test_results["clear_uploads"] = await self.test_admin_clear_uploads()
        
        # Test 3: Admin Security Teams
        test_results["security_teams"] = await self.test_admin_security_teams()
        
        # Test 4: Admin Analytics
        test_results["analytics"] = await self.test_admin_analytics()
        
        # Test 5: Admin Broadcast
        test_results["broadcast"] = await self.test_admin_broadcast()
        
        # Test 6: Admin Audit Log
        test_results["audit_log"] = await self.test_admin_audit_log()
        
        # Summary
        logger.info("="*60)
        logger.info("📋 TEST SUMMARY:")
        passed = sum(1 for result in test_results.values() if result)
        total = len(test_results)
        
        for test_name, result in test_results.items():
            status = "✅ PASS" if result else "❌ FAIL"
            logger.info(f"   {test_name.upper().replace('_', ' ')}: {status}")
        
        logger.info(f"OVERALL: {passed}/{total} tests passed")
        
        if passed == total:
            logger.info("🎉 All admin API tests passed!")
        else:
            logger.warning(f"⚠️  {total - passed} test(s) failed")
        
        return test_results

async def main():
    """Main test function"""
    async with SafeGuardAPITester() as tester:
        results = await tester.run_all_tests()
        return results

if __name__ == "__main__":
    results = asyncio.run(main())