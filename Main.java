public class Main {
    public static void main(String[] args) {
        DatabaseHandler db = new DatabaseHandler();
        db.createTables();
        db.saveWorkout("Upper Day");
        db.saveWorkout("Lower Day");
    }
}