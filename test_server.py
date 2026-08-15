import tempfile
import unittest
from pathlib import Path

from server import LibraryStore


class LibraryStoreTest(unittest.TestCase):
    def test_records_are_shared_and_deletions_persist(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "library.json"
            store = LibraryStore(path)
            store.upsert({"id": "chat", "name": "Chat", "updatedAt": 1, "project": {}})
            store.upsert({"id": "oiseau", "name": "Oiseau", "updatedAt": 2, "project": {}})
            store.upsert({"id": "chat", "name": "Chat modifié", "updatedAt": 3, "project": {}})

            self.assertEqual([item["id"] for item in LibraryStore(path).read()], ["chat", "oiseau"])
            self.assertEqual(store.read()[0]["name"], "Chat modifié")
            store.delete("chat")
            self.assertEqual([item["id"] for item in LibraryStore(path).read()], ["oiseau"])


if __name__ == "__main__":
    unittest.main()
