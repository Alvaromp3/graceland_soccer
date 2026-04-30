import unittest

import warnings

# Keep test output clean: model artifact warnings are expected in this repo.
warnings.filterwarnings("ignore", message=r"Trying to unpickle estimator[\\s\\S]*")
warnings.filterwarnings(
    "ignore",
    message=r"X does not have valid feature names, but .* was fitted with feature names",
)

from app.services.data_service import DataService
from app.services.ml_service import MLService


SAMPLE_CSV = b"""Player Name,Date,Session Title,Player Load,Duration,Distance (miles),Sprint Distance (yards),Top Speed (mph),Max Acceleration (yd/s/s),Max Deceleration (yd/s/s),Work Ratio,Energy (kcal),Hr Load,Impacts,Power Plays,Power Score (w/kg),Distance Per Min (yd/min)
Alice,2026-04-01,Training,320,60,4.2,350,17.5,2.1,2.0,14,520,75,10,4,6.2,120
Alice,2026-04-03,Match vs Rivals,540,88,6.3,720,20.4,2.5,2.4,21,780,110,18,7,7.8,145
Bob,2026-04-02,Training,260,58,3.8,250,16.2,2.0,1.9,12,460,68,8,3,5.9,110
Bob,2026-04-04,Match vs Rivals,470,85,5.8,640,19.8,2.4,2.3,18,710,101,16,6,7.1,138
Cara,2026-04-01,Training,210,55,3.3,180,15.7,1.8,1.8,10,430,60,7,2,5.4,105
Cara,2026-04-05,Training,230,57,3.5,190,16.0,1.9,1.8,11,445,63,7,2,5.5,108
Dan,2026-04-01,Training,340,62,4.4,330,17.8,2.2,2.1,15,540,77,11,4,6.4,122
Dan,2026-04-06,Match vs Rivals,560,90,6.5,760,20.8,2.6,2.5,23,800,115,19,7,8.0,148
Evan,2026-04-02,Training,280,59,3.9,260,16.8,2.0,1.9,13,470,69,8,3,6.0,112
Evan,2026-04-07,Training,300,61,4.1,290,17.2,2.1,2.0,14,495,72,9,4,6.1,116
"""


class DataServiceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.service = DataService()
        self.service.load_from_upload(SAMPLE_CSV, 'mens')

    def test_stable_player_ids_can_be_resolved(self) -> None:
        players = self.service.get_all_players()
        self.assertTrue(players)
        player = players[0]
        detail = self.service.get_player_detail(player['id'])
        self.assertIsNotNone(detail)
        self.assertEqual(detail['name'], player['name'])

    def test_delete_player_uses_stable_id(self) -> None:
        player = self.service.get_all_players()[0]
        self.assertTrue(self.service.delete_player_data(player['id']))
        remaining_names = [entry['name'] for entry in self.service.get_all_players()]
        self.assertNotIn(player['name'], remaining_names)

    def test_analytics_payload_is_generated(self) -> None:
        analytics = self.service.get_analytics_overview()
        self.assertIn('rollingLoad', analytics)
        self.assertIn('sessionSplit', analytics)
        self.assertGreater(len(analytics['sessionSplit']), 0)


class MLServiceTests(unittest.TestCase):
    def test_rule_based_prediction_returns_valid_level(self) -> None:
        service = MLService()
        risk_level, probability, factors, recommendations = service.predict_risk({
            'Player Load': 550,
            'Work Ratio': 24,
            'Top Speed (mph)': 20,
            'Sprint Distance (yards)': 650,
        })
        self.assertIn(risk_level, {'low', 'medium', 'high'})
        self.assertGreaterEqual(probability, 0)
        self.assertTrue(factors)
        self.assertTrue(recommendations)


if __name__ == '__main__':
    unittest.main()
