from prometheus_client import Counter

REQUESTS = Counter(
    'cyvxai_requests_total',
    'Total Requests'
)

def track():

    REQUESTS.inc()
