import java.util.ArrayList;

public class Exercise {
    String name;
    ArrayList<ExerciseSet> sets = new ArrayList<>();

    Exercise(String name){
        this.name = name;
    }
    
    void addSet(ExerciseSet set){
        sets.add(set);
        System.out.println("Set added");
    }

    void removeSet(int index){
        sets.remove(index);
        System.out.println("Set " + (index+1) + " removed");
    }

    @Override
    public String toString(){
        String header = "Exercise: " + this.name;
        
        for (int i = 0; i < this.sets.size(); i++) {
            String set = "\nSet " + (i+1) + ": \n" + this.sets.get(i) +"-----\n";
            header += set;
        }
        return header;
    }
}
